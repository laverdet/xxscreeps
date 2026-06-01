export module screeps:position;
import :utility;
import auto_js;
import std;
import util;

namespace screeps {

// Packed integer layout of "WorldPosition" type, from JS
struct packed_position {
#if __BYTE_ORDER == __LITTLE_ENDIAN
		// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
		packed_position(std::uint16_t xx, std::uint16_t yy) : xx{xx}, yy{yy} {}
		std::uint16_t xx;
		std::uint16_t yy;
#elif __BYTE_ORDER == __BIG_ENDIAN
		// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
		packed_position(std::uint16_t xx, std::uint16_t yy) : xx{xx}, yy{yy} {}
		std::uint16_t yy;
		std::uint16_t xx;
#else
#error "Unsupported endianness"
#endif
};

//
// Similar to a RoomPosition object, but stores coordinates in a continuous global plane.
// Conversions to/from this coordinate plane are handled on the JS side
export struct world_position_t {
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
		// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
		world_position_t(int xx, int yy) : xx{xx}, yy{yy} {}

		explicit world_position_t(packed_position pos) : xx{pos.xx}, yy{pos.yy} {}

		explicit operator packed_position() const {
			return packed_position{static_cast<std::uint16_t>(xx), static_cast<std::uint16_t>(yy)};
		}

		static auto null() -> world_position_t {
			return world_position_t{std::numeric_limits<int>::min(), std::numeric_limits<int>::max()};
		}

		friend auto operator<<(std::ostream& os, const world_position_t& that) -> std::ostream& {
			auto rx = (that.xx / 50) - 0x80;
			auto ry = (that.yy / 50) - 0x80;
			bool ww = rx < 0;
			bool nn = ry < 0;
			os << "world_position_t(["
				 << (ww ? 'W' : 'E')
				 << (ww ? -1 - rx : rx)
				 << (nn ? 'N' : 'S')
				 << (nn ? -1 - ry : ry)
				 << "] "
				 << that.xx % 50
				 << ", "
				 << that.yy % 50
				 << ")";
			return os;
		}

		auto operator==(const world_position_t& right) const -> bool = default;

		auto is_null() const -> bool {
			return *this == null();
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

namespace js {
using namespace screeps;

template <>
struct visit<void, world_position_t> {
		template <class Accept>
		constexpr auto operator()(world_position_t subject, const Accept& accept) const -> accept_target_t<Accept> {
			auto value = std::bit_cast<std::int32_t>(packed_position{subject});
			return accept(number_tag_of<std::int32_t>{}, *this, value);
		}

		consteval static auto types(auto /*recursive*/) { return util::type_pack{}; }
};

template <>
struct accept<void, world_position_t> {
		constexpr auto operator()(number_tag /*tag*/, visit_holder /*visit*/, auto&& subject) const -> world_position_t {
			auto value = std::int32_t{std::forward<decltype(subject)>(subject)};
			return world_position_t{std::bit_cast<packed_position>(value)};
		}

		consteval static auto types(auto /*recursive*/) { return util::type_pack{}; }
};

} // namespace js
