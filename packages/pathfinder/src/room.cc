export module screeps:room;
import std;
import :utility;

namespace screeps {

//
// Stores coordinates of a room on the global world map.
// For instance, "E1N1" -> { xx: 129, yy: 126 } -- this is implemented in JS
struct room_location_t {
		std::uint8_t xx, yy;

		room_location_t() = default;

		// NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
		room_location_t(std::uint8_t xx, std::uint8_t yy) : xx{xx}, yy{yy} {}

		auto operator==(const room_location_t& right) const -> bool = default;

		struct hash_t {
				auto operator()(const room_location_t& val) const -> std::size_t {
					return std::hash<std::int16_t>()(flatten(val));
				}
		};
};

//
// Stores context about a room, specific to each search
export struct room_info_t {
		std::uint8_t* terrain;
		std::uint8_t (*cost_matrix)[ 50 ];
		room_location_t pos;

		room_info_t() = default;
		room_info_t(std::uint8_t* terrain, std::uint8_t* cost_matrix, room_location_t pos) :
				terrain{terrain},
				cost_matrix{(std::uint8_t (*)[ 50 ])(cost_matrix)},
				pos{pos} {}

		auto terrain_look(unsigned xx, unsigned yy) const -> std::uint8_t {
			unsigned index = yy * 50 + xx;
			return 0x03 & terrain[ index / 4 ] >> (index % 4 * 2);
		}
};

}; // namespace screeps
