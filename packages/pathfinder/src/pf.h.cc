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
export using room_callback_result_type = std::variant<std::monostate, bool, std::span<const std::uint8_t>>;
using blocked_rooms_type = std::unordered_set<room_location_t, room_location_t::hash>;

// Requirement for astar. Provides autocomplete via clangd.
template <class Type>
concept astar_pathfinder = requires(Type pf) {
	{ pf.look_open(world_position_t{}) } -> std::same_as<std::pair<room_index_t, cost_t>>;
	{ pf.push_node(indexed_position_t{}, pos_index_t{}, cost_t{}) } -> std::same_as<void>;
};

// Requirement for jps
template <class Type>
concept jps_pathfinder = astar_pathfinder<Type> && requires(Type pf) {
	{ pf.heuristic(indexed_position_t{}) } -> std::same_as<cost_t>;
	{ pf.look(indexed_position_t{}) } -> std::same_as<cost_t>;
	{ pf.parent_of(pos_index_t{}) } -> std::same_as<indexed_position_t>;
};

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
struct room_entry {
		room_location_t room;
		terrain_span_type terrain;

		constexpr static auto struct_template = js::struct_template{
			js::struct_member{util::cw<"room">, &room_entry::room},
			js::struct_member{util::cw<"terrain">, &room_entry::terrain},
		};
};
export using world_type = std::vector<room_entry>;
using terrain_map_type = std::array<terrain_type, map_position_size>;

// Load process-wide shared terrain
export auto load_terrain(const world_type& world) -> void;

// sentinel_path_iterator
struct sentinel_path_iterator {
		constexpr auto operator==(const auto& right) const -> bool { return right.index_ == sentinel_pos_index; }
};

// path_iterator
class path_iterator : public util::incrementable_facade {
	public:
		friend sentinel_path_iterator;
		using util::incrementable_facade::operator++;
		using value_type = world_position_t;

		explicit constexpr path_iterator(sentinel_path_iterator /*sentinel*/) :
				rooms_{nullptr},
				parents_{nullptr},
				index_{sentinel_pos_index} {}

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

// Big state arrays that are allocated once upfront and then reused for all iterations
template <std::size_t RoomCapacity>
struct instance_state {
		constexpr static auto search_capacity = k_room_size * RoomCapacity;
		static_assert(std::numeric_limits<pos_index_t>::max() > search_capacity + k_room_size, "pos_index_t is too small");

		using room_scope_table = scope_table<room_terrain, room_location_t, RoomCapacity>;
		using open_closed_type = open_closed_t<search_capacity>;

		struct heap_node {
				constexpr auto operator==(const heap_node& right) const -> bool = default;
				pos_index_t pos;
				cost_t score;
				constexpr static auto projection = [](const heap_node& node) -> cost_t { return node.score; };
		};
		using heap_type = heap_t<heap_node, std::greater<>, decltype(heap_node::projection), search_capacity / 8>;

		room_scope_table room_table;
		std::array<pos_index_t, search_capacity> parents;
		std::array<cost_t, search_capacity> scores;
		open_closed_type open_closed;
		heap_type heap;
};

// Provides operations for pathfinder terrain look
template <class Callback, class RoomTable>
// NOLINTNEXTLINE(cppcoreguidelines-pro-type-member-init)
struct look_delegate {
		[[nodiscard]] auto look(indexed_position_t pos) const -> cost_t;
		auto look_open(world_position_t pos) -> std::pair<room_index_t, cost_t>;
		auto room_index_from_location(room_location_t location) -> room_index_t;
		[[nodiscard]] auto index_from_pos(world_position_t pos) const -> indexed_position_t;

		unsigned max_rooms{};
		terrain_cost_type look_table{};
		Callback room_callback;
		std::reference_wrapper<blocked_rooms_type> blocked_rooms;
		std::reference_wrapper<RoomTable> room_table;
};

// Provides `parent_of` and `push_node`
template <std::size_t RoomCapacity>
struct node_delegate {
		auto parent_of(pos_index_t index) -> indexed_position_t;
		auto push_node(indexed_position_t node, pos_index_t parent_index, cost_t g_cost) -> void;

		heuristic_t heuristic;
		double heuristic_weight{};
		std::reference_wrapper<instance_state<RoomCapacity>> state;
};

// Collect everything above into an instantiable implementation
export template <auto Check, class Callback, std::size_t RoomCapacity>
class pathfinder {
	public:
		auto search(Callback room_callback, world_position_t origin, goals_type goals, const options& options) -> std::optional<result>;

	private:
		instance_state<RoomCapacity> instance_state_;
};

}; // namespace screeps

// ---

namespace js {

template <>
struct tagged_range<screeps::path_range_type> : std::type_identity<vector_tag> {};

} // namespace js
