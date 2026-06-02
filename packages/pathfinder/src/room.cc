export module screeps:room;
import std;
import :utility;

namespace screeps {

// CostMatrix is a [50, 50] mdspan (missing library support)
// using cost_matrix_type = std::mdspan<const std::uint8_t, std::extents<std::size_t, 50, 50>>;
// NOLINTNEXTLINE(modernize-avoid-c-arrays)
using cost_matrix_type = const std::uint8_t (*)[ 50 ];

// maximum: longest chebyshev distance of whole map
using cost_t = int;

// Table of terrain costs [ plain, swamp, wall, [??] ]
using terrain_cost_type = std::array<cost_t, 4>;

// Stores coordinates of a room on the global world map.
// For instance, "E1N1" -> { xx: 129, yy: 126 } -- this is implemented in JS
struct room_location_t {
		struct hash;

		room_location_t() = default;
		// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
		constexpr room_location_t(std::uint8_t xx, std::uint8_t yy) : xx{xx}, yy{yy} {}
		constexpr auto operator==(const room_location_t& right) const -> bool = default;

		std::uint8_t xx, yy;
};

struct room_location_t::hash : std::hash<std::int16_t> {
		using std::hash<std::int16_t>::operator();
		constexpr auto operator()(const room_location_t& location) const -> std::size_t {
			return (*this)(std::bit_cast<std::int16_t>(location));
		}
};

//
// Stores context about a room, specific to each search
export struct room_info_t {
	public:
		constexpr room_info_t() = default;
		constexpr room_info_t(std::uint8_t* terrain, cost_matrix_type cost_matrix, room_location_t pos) :
				terrain_{terrain},
				cost_matrix_{cost_matrix},
				pos{pos} {}

		[[nodiscard]] constexpr auto operator()(const terrain_cost_type& costs, unsigned xx, unsigned yy) const -> unsigned {
			if (cost_matrix_ == nullptr) {
				return terrain_look(costs, xx, yy);
			} else {
				return cost_matrix_look(costs, xx, yy);
			}
		}

	private:
		[[nodiscard]] constexpr auto terrain_look(const terrain_cost_type& costs, unsigned xx, unsigned yy) const -> unsigned {
			auto index = (yy * 50) + xx;
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic, cppcoreguidelines-pro-bounds-constant-array-index)
			return costs[ (unsigned{terrain_[ index / 4 ]} >> (index % 4 * 2)) & 0x03 ];
		}

		[[nodiscard]] constexpr auto cost_matrix_look(const terrain_cost_type& costs, unsigned xx, unsigned yy) const -> unsigned {
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
			int cost = cost_matrix_[ xx % 50 ][ yy % 50 ];
			return cost == 0 ? terrain_look(costs, xx, yy) : cost;
		}

		std::uint8_t* terrain_{};
		cost_matrix_type cost_matrix_{nullptr};

	public:
		room_location_t pos{};
};

}; // namespace screeps
