export module screeps:room;
import :utility;
import auto_js;
import std;

namespace screeps {

// maximum: k_max_rooms (32 bits tested faster than uint8_t)
using room_index_t = nominal<int, struct _room_index>;
constexpr auto room_index_sentinel = room_index_t{0};

// CostMatrix is a [50, 50] multi-dimensional array (mdspan cannot be nulled)
// NOLINTNEXTLINE(modernize-avoid-c-arrays)
export using cost_matrix_type = const std::uint8_t (*)[ 50 ];

// Terrain data is packed 2 bits per tile, 2500 * 2 / 8 = 625
export using terrain_type = const std::uint8_t*;

// maximum: longest chebyshev distance of whole map
using cost_t = int;

// Table of terrain costs [ plain, swamp, wall, [??] ]
using terrain_cost_type = std::array<cost_t, 4>;

// Stores coordinates of a room on the global world map.
// For instance, "E1N1" -> { xx: 129, yy: 126 } -- this is implemented in JS
export struct room_location_t {
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

// Stores room terrain data, specific to each search
struct room_terrain {
	public:
		constexpr room_terrain() = default;
		constexpr room_terrain(terrain_type terrain, cost_matrix_type cost_matrix) :
				terrain_{terrain},
				cost_matrix_{cost_matrix} {}

		[[nodiscard]] constexpr auto operator()(const terrain_cost_type& costs, unsigned xx, unsigned yy) const -> cost_t {
			if (cost_matrix_ == nullptr) {
				return terrain_look(costs, xx, yy);
			} else {
				return cost_matrix_look(costs, xx, yy);
			}
		}

	private:
		[[nodiscard]] constexpr auto terrain_look(const terrain_cost_type& costs, unsigned xx, unsigned yy) const -> cost_t {
			auto index = (yy * 50) + xx;
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic, cppcoreguidelines-pro-bounds-constant-array-index)
			return costs[ (unsigned{terrain_[ index / 4 ]} >> (index % 4 * 2)) & 0x03 ];
		}

		[[nodiscard]] constexpr auto cost_matrix_look(const terrain_cost_type& costs, unsigned xx, unsigned yy) const -> cost_t {
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
			int cost = cost_matrix_[ xx % 50 ][ yy % 50 ];
			return cost == 0 ? terrain_look(costs, xx, yy) : cost;
		}

		terrain_type terrain_{};
		cost_matrix_type cost_matrix_{nullptr};
};

// Stores room terrain data with incrementing 1-based index. You can lookup by index or "scope"
// (which is room_location_t).
template <class Type, class Scope, std::size_t Capacity>
class scope_table {
	public:
		using index_type = uint_for_size_t<sizeof(Scope)>;
		using value_type = std::pair<Scope, Type>;

		constexpr scope_table() {
			std::ranges::fill(reverse_table_, sentinel);
		}

		[[nodiscard]] constexpr auto size() const { return table_.size(); }
		constexpr auto begin(this auto& self) { return self.table_.begin(); }
		constexpr auto data(this auto& self) { return self.table_.data(); }
		constexpr auto end(this auto& self) { return self.table_.end(); }
		constexpr auto operator[](this auto& self, std::size_t index) -> auto& { return self.table_[ index ]; }

		constexpr auto clear() -> void {
			for (const auto& value : table_) {
				reverse_table_[ std::bit_cast<index_type>(value.first) ] = sentinel;
			}
			table_.clear();
		}

		constexpr auto find(Scope scope) const -> index_type {
			return reverse_table_[ std::bit_cast<index_type>(scope) ];
		}

		constexpr auto insert(value_type value) -> index_type {
			auto index = table_.size() + 1;
			table_.emplace_back(value);
			reverse_table_[ std::bit_cast<index_type>(value.first) ] = index;
			return static_cast<index_type>(index);
		}

		constexpr static auto sentinel = 0;

	private:
		inplace_vector<value_type, Capacity> table_;
		std::array<index_type, 1 << (sizeof(Scope) * 8)> reverse_table_;
};

}; // namespace screeps

// ---

namespace js {
using namespace screeps;

template <>
struct visit<void, room_location_t> {
		template <class Accept>
		constexpr auto operator()(room_location_t subject, const Accept& accept) const -> accept_target_t<Accept> {
			auto value = std::int32_t{std::bit_cast<std::uint16_t>(subject)};
			return accept(number_tag_of<std::int32_t>{}, *this, value);
		}

		consteval static auto types(auto /*recursive*/) { return util::type_pack{}; }
};

template <>
struct accept<void, room_location_t> {
		constexpr auto operator()(number_tag /*tag*/, visit_holder /*visit*/, auto&& subject) const -> room_location_t {
			auto value = std::uint16_t{std::int32_t{std::forward<decltype(subject)>(subject)}};
			return std::bit_cast<room_location_t>(value);
		}

		consteval static auto types(auto /*recursive*/) { return util::type_pack{}; }
};

} // namespace js

// ---

namespace std {
using namespace screeps;

template <>
struct formatter<room_location_t> : formatter<std::string> {
		using formatter<std::string>::format;
		auto format(room_location_t room, std::format_context& context) const {
			auto rx = room.xx - 0x80;
			auto ry = room.yy - 0x80;
			auto ww = rx < 0;
			auto nn = ry < 0;
			auto output = std::format(
				"{}{}{}{}",
				ww ? 'W' : 'E',
				ww ? -1 - rx : rx,
				nn ? 'N' : 'S',
				nn ? -1 - ry : ry
			);
			return format(output, context);
		}
};

} // namespace std
