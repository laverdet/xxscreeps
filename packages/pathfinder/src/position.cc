module;
#include "nan.h"
export module screeps:position;
import std;
import :utility;

namespace screeps {

//
// Similar to a RoomPosition object, but stores coordinates in a continuous global plane.
// Conversions to/from this coordinate plane are handled on the JS side
struct world_position_t {
		int xx, yy; // maximum: world_size[255] * 50 (32 bits tested faster than uint16_t)

		enum direction_t { TOP,
											 TOP_RIGHT,
											 RIGHT,
											 BOTTOM_RIGHT,
											 BOTTOM,
											 BOTTOM_LEFT,
											 LEFT,
											 TOP_LEFT };

		world_position_t() = default;
		world_position_t(int xx, int yy) : xx{xx}, yy{yy} {}
		explicit world_position_t(v8::Local<v8::Value> pos) {
			auto value = Nan::To<std::int32_t>(pos.As<v8::Number>()).FromJust();
			xx = ((value >> 16) & 0xff) + (value & 0xff) * 50;
			yy = ((value >> 24) & 0xff) + ((value >> 8) & 0xff) * 50;
		}

		explicit operator v8::Local<v8::Value>() {
			return Nan::New((yy % 50) << 24 | (xx % 50) << 16 | (yy / 50) << 8 | xx / 50);
		}

		static auto null() -> world_position_t {
			return unflatten<world_position_t>(0U);
		}

		friend auto operator<<(std::ostream& os, const world_position_t& that) -> std::ostream& {
			int xx = static_cast<int>(that.xx / 50);
			int yy = static_cast<int>(that.yy / 50);
			bool w = xx <= 127;
			bool n = yy <= 127;
			os << "world_position_t(["
				 << (w ? 'W' : 'E')
				 << (w ? 127 - xx : xx - 128)
				 << (n ? 'N' : 'S')
				 << (n ? 127 - yy : yy - 128)
				 << "] " << that.xx % 50 << ", " << that.yy % 50 << ")";
			return os;
		}

		auto operator!=(world_position_t right) const -> bool {
			return flatten(*this) != flatten(right);
		}

		auto is_null() const -> bool {
			return flatten(*this) == 0;
		}

		auto position_in_direction(direction_t dir) const -> world_position_t {
			switch (dir) {
				case TOP:
					return {xx, yy - 1};
				case TOP_RIGHT:
					return {xx + 1, yy - 1};
				case RIGHT:
					return {xx + 1, yy};
				case BOTTOM_RIGHT:
					return {xx + 1, yy + 1};
				case BOTTOM:
					return {xx, yy + 1};
				case BOTTOM_LEFT:
					return {xx - 1, yy + 1};
				case LEFT:
					return {xx - 1, yy};
				case TOP_LEFT:
					return {xx - 1, yy - 1};
			}
		}

		// Gets the linear direction to a tile
		auto direction_to(world_position_t pos) const -> direction_t {
			int dx = pos.xx - xx;
			int dy = pos.yy - yy;
			if (dx > 0) {
				if (dy > 0) {
					return BOTTOM_RIGHT;
				} else if (dy < 0) {
					return TOP_RIGHT;
				} else {
					return RIGHT;
				}
			} else if (dx < 0) {
				if (dy > 0) {
					return BOTTOM_LEFT;
				} else if (dy < 0) {
					return TOP_LEFT;
				} else {
					return LEFT;
				}
			} else {
				if (dy > 0) {
					return BOTTOM;
				} else if (dy < 0) {
					return TOP;
				}
			}
			return (direction_t)-1;
		}

		auto range_to(const world_position_t pos) const -> cost_t {
			return std::max(std::abs(pos.xx - xx), std::abs(pos.yy - yy));
		}
};

}; // namespace screeps
