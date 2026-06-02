export module screeps:position;
import :room;
import :utility;
import auto_js;
import std;
import util;

namespace screeps {

// Cardinal movement directions
enum class direction_t : std::uint8_t {
	TOP,
	TOP_RIGHT,
	RIGHT,
	BOTTOM_RIGHT,
	BOTTOM,
	BOTTOM_LEFT,
	LEFT,
	TOP_LEFT
};

// Packed integer layout of "WorldPosition" type, from JS
struct packed_position {
#if __BYTE_ORDER == __LITTLE_ENDIAN
		// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
		constexpr packed_position(std::uint16_t xx, std::uint16_t yy) : xx{xx}, yy{yy} {}
		std::uint16_t xx;
		std::uint16_t yy;
#elif __BYTE_ORDER == __BIG_ENDIAN
		// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
		constexpr packed_position(std::uint16_t xx, std::uint16_t yy) : xx{xx}, yy{yy} {}
		std::uint16_t yy;
		std::uint16_t xx;
#else
#error "Exotic endianness?"
#endif
};

//
// Similar to a RoomPosition object, but stores coordinates in a continuous global plane.
// Conversions to/from this coordinate plane are handled on the JS side
export struct world_position_t {
		// xx & yy components are aligned to the register size because otherwise both get passed on the
		// same register and it ends up slower
		alignas(std::ptrdiff_t) int xx{};
		alignas(std::ptrdiff_t) int yy{};

		constexpr world_position_t() = default;
		// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
		constexpr world_position_t(int xx, int yy) : xx{xx}, yy{yy} {}

		explicit constexpr world_position_t(packed_position pos) : xx{pos.xx}, yy{pos.yy} {}

		explicit constexpr operator packed_position() const {
			return packed_position{static_cast<std::uint16_t>(xx), static_cast<std::uint16_t>(yy)};
		}

		friend auto operator<<(std::ostream& os, const world_position_t& that) -> std::ostream& {
			auto rx = (that.xx / 50) - 0x80;
			auto ry = (that.yy / 50) - 0x80;
			auto ww = rx < 0;
			auto nn = ry < 0;
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

		constexpr auto operator==(const world_position_t& right) const -> bool = default;

		[[nodiscard]] constexpr auto position_in_direction(direction_t dir) const -> world_position_t {
			constexpr auto delta = std::array{
				std::pair{0, -1},
				std::pair{1, -1},
				std::pair{1, 0},
				std::pair{1, 1},
				std::pair{0, 1},
				std::pair{-1, 1},
				std::pair{-1, 0},
				std::pair{-1, -1},
			};
			auto ii = static_cast<std::underlying_type_t<direction_t>>(dir);
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
			return {xx + delta[ ii ].first, yy + delta[ ii ].second};
		}

		// Gets the linear direction to a tile
		[[nodiscard]] constexpr auto direction_to(world_position_t pos) const -> direction_t {
			constexpr auto delta = std::array{
				std::array{direction_t::TOP_LEFT, direction_t::TOP, direction_t::TOP_RIGHT},
				std::array{direction_t::LEFT, static_cast<direction_t>(-1), direction_t::RIGHT},
				std::array{direction_t::BOTTOM_LEFT, direction_t::BOTTOM, direction_t::BOTTOM_RIGHT},
			};
			auto dx = sign(pos.xx - xx) + 1;
			auto dy = sign(pos.yy - yy) + 1;
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
			return delta[ dx ][ dy ];
		}

		[[nodiscard]] constexpr auto range_to(world_position_t pos) const -> int {
			return std::max(std::abs(pos.xx - xx), std::abs(pos.yy - yy));
		}

		[[nodiscard]] constexpr auto room() const -> room_location_t {
			return room_location_t{
				static_cast<std::uint8_t>(xx / 50U),
				static_cast<std::uint8_t>(yy / 50U),
			};
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
