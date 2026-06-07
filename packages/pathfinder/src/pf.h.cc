export module screeps:pf;
export import :heap;
export import :heuristic;
export import :open_closed;
export import :position;
export import :room;
export import :utility;
import std;

namespace screeps {

constexpr auto k_room_size = 50 * 50;
constexpr auto map_position_size = 1 << sizeof(room_location_t) * 8;
constexpr auto sentinel_pos_index = pos_index_t{std::numeric_limits<pos_index_t::value_type>::max()};

// Params for `search`
using goals_type = std::vector<heuristic_t::goal_t>;
struct options {
		double heuristic_weight;
		cost_t plain_cost;
		cost_t swamp_cost;
		int max_cost;
		int max_ops;
		int max_rooms;
		bool flee;
};

// Params for `load_terrain`
export using world_type = std::vector<std::pair<room_location_t, terrain_type>>;
using terrain_map_type = std::array<terrain_type, map_position_size>;

// path_iterator
class path_iterator : public util::incrementable_facade {
	public:
		friend struct sentinel_path_iterator;
		using util::incrementable_facade::operator++;
		using value_type = world_position_t;

		constexpr path_iterator(const auto& rooms, const auto& parents, pos_index_t index) :
				rooms_{rooms.data()},
				parents_{parents.data()},
				index_{index} {}
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
		constexpr auto operator++() -> auto& { return (index_ = parents_[ *index_ ], *this); }
		constexpr auto operator==(const path_iterator& right) const -> bool { return index_ == right.index_; }
		// NOLINTNEXTLINE(cppcoreguidelines-slicing)
		constexpr auto operator*() const -> world_position_t { return indexed_position_t{rooms_, index_}; }

	private:
		indexed_position_t::room_table_type rooms_;
		const pos_index_t* parents_;
		pos_index_t index_;
};

// sentinel_path_iterator
struct sentinel_path_iterator {
		constexpr auto operator==(const auto& right) const -> bool { return right.index_ == sentinel_pos_index; }
};

// std::ranges-compatible path iterator which walks the path backward from parents
using path_range_type = std::ranges::subrange<path_iterator, sentinel_path_iterator>;

// Result of `search`
export struct result {
		path_range_type path;
		int cost{};
		int ops{};
		bool incomplete{};

		constexpr static auto struct_template = js::struct_template{
			js::struct_member{util::cw<"cost">, &result::cost},
			js::struct_member{util::cw<"incomplete">, &result::incomplete},
			js::struct_member{util::cw<"ops">, &result::ops},
			js::struct_member{util::cw<"path">, &result::path},
		};
};

// Collect everything above into an instantiable implementation
export template <auto Check, class Callback, std::size_t RoomCapacity>
class pathfinder {
	public:
		constexpr static auto search_capacity = k_room_size * RoomCapacity;
		static_assert(std::numeric_limits<pos_index_t>::max() > search_capacity + k_room_size, "pos_index_t is too small");

	private:
		using room_scope_table = scope_table<room_terrain, room_location_t, RoomCapacity>;
		using open_closed_type = open_closed_t<search_capacity>;
		using heap_score_type = score_table_t<pos_index_t::value_type, cost_t, search_capacity>;
		using heap_type = heap_t<pos_index_t::value_type, std::greater<>, heap_score_type, search_capacity / 8>;

		// State
		[[nodiscard]] auto heuristic(indexed_position_t pos) const -> cost_t;
		[[nodiscard]] auto heuristic(world_position_t pos) const -> cost_t;
		[[nodiscard]] auto index_from_pos(world_position_t pos) const -> indexed_position_t;
		[[nodiscard]] auto look(indexed_position_t pos) const -> cost_t;
		auto look_open(world_position_t pos) -> std::pair<room_index_t, cost_t>;
		auto push_node(indexed_position_t node, pos_index_t parent_index, cost_t g_cost) -> void;
		auto reset(Callback callback, goals_type goals, const options& options) -> void;
		auto room_index_from_location(room_location_t location) -> room_index_t;

		// Logic
		auto astar(indexed_position_t pos, pos_index_t index, cost_t g_cost) -> void;
		auto jump_x(indexed_position_t pos, int dx, cost_t cost) -> indexed_position_t;
		auto jump_y(indexed_position_t pos, int dy, cost_t cost) -> indexed_position_t;
		auto jump_xy(indexed_position_t pos, int dx, int dy, cost_t cost) -> indexed_position_t;
		auto jump(indexed_position_t pos, int dx, int dy, cost_t cost) -> indexed_position_t;
		auto jps(indexed_position_t pos, pos_index_t index, cost_t g_cost) -> void;
		auto jump_neighbor(indexed_position_t neighbor, indexed_position_t pos, pos_index_t index, cost_t g_cost, cost_t cost, cost_t n_cost) -> void;

	public:
		// Module interface
		auto search(Callback room_callback, world_position_t origin, goals_type goals, const options& options) -> std::optional<result>;
		static auto load_terrain(const world_type& world) -> void;

	private:
		room_scope_table room_table_;
		std::unordered_set<room_location_t, room_location_t::hash> blocked_rooms_;
		std::array<pos_index_t, search_capacity> parents_;
		open_closed_type open_closed_;
		heap_type heap_;
		heuristic_t heuristic_;
		terrain_cost_type look_table_ = {{obstacle, obstacle, obstacle, obstacle}};
		Callback room_callback_;
		double heuristic_weight_{};
		unsigned max_rooms_{};
};

}; // namespace screeps

// ---

namespace js {

template <>
struct tagged_range<screeps::path_range_type> : std::type_identity<vector_tag> {};

} // namespace js
