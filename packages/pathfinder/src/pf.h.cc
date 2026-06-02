module;
#include <nan.h>
export module screeps;
export import :heap;
export import :heuristic;
export import :open_closed;
export import :position;
export import :room;
export import :utility;
import std;

namespace screeps {

constexpr auto k_max_rooms = 64;
constexpr auto k_room_size = 50 * 50;
constexpr auto k_search_capacity = k_room_size * k_max_rooms;

static_assert(std::numeric_limits<pos_index_t>::max() > k_search_capacity, "pos_index_t is too small");

//
// Path finder encapsulation. Multiple instances are thread-safe
export class path_finder_t {
	public:
		class path_iterator;
		class sentinel_path_iterator;
		struct result;
		struct search_options;

	private:
		constexpr static size_t map_position_size = 1 << sizeof(room_location_t) * 8;
		constexpr static cost_t obstacle = 0;

		using room_scope_table = scope_table<room_terrain, room_location_t, k_max_rooms>;
		using open_closed_type = open_closed_t<k_search_capacity>;
		using heap_score_type = score_table_t<pos_index_t::value_type, cost_t, k_search_capacity>;
		using heap_type = heap_t<pos_index_t::value_type, std::greater<>, heap_score_type, k_search_capacity / 8>;

		room_scope_table room_table_;
		std::unordered_set<room_location_t, room_location_t::hash> blocked_rooms;
		std::array<pos_index_t, k_search_capacity> parents;
		open_closed_type open_closed;
		heap_type heap;
		heuristic_t heuristic_;
		terrain_cost_type look_table = {{obstacle, obstacle, obstacle, obstacle}};
		double heuristic_weight;
		unsigned max_rooms;
		v8::Local<v8::Function> room_callback_;
		bool _is_in_use = false;

		class js_error : public std::runtime_error {
			public:
				js_error() : std::runtime_error("js error") {}
		};

		auto index_from_pos(world_position_t pos) -> indexed_position_t;
		auto room_index_from_location(room_location_t location) -> room_index_t;
		auto push_node(indexed_position_t node, pos_index_t parent_index, cost_t g_cost) -> void;

		auto look(indexed_position_t pos) -> cost_t;
		auto look_open(world_position_t pos) -> std::pair<room_index_t, cost_t>;

		auto astar(indexed_position_t pos, pos_index_t index, cost_t g_cost) -> void;

		auto jump_x(indexed_position_t pos, int dx, cost_t cost) -> indexed_position_t;
		auto jump_y(indexed_position_t pos, int dy, cost_t cost) -> indexed_position_t;
		auto jump_xy(indexed_position_t pos, int dx, int dy, cost_t cost) -> indexed_position_t;
		auto jump(indexed_position_t pos, int dx, int dy, cost_t cost) -> indexed_position_t;
		auto jps(indexed_position_t pos, pos_index_t index, cost_t g_cost) -> void;
		auto jump_neighbor(indexed_position_t neighbor, indexed_position_t pos, pos_index_t index, cost_t g_cost, cost_t cost, cost_t n_cost) -> void;

	public:
		using terrain_map_type = std::array<terrain_type, map_position_size>;

		auto lookup(pos_index_t index) const -> pos_index_t { return parents[ *index ]; };
		auto room_table() const -> const room_scope_table& { return room_table_; }

		auto search(
			world_position_t origin,
			std::vector<heuristic_t::goal_t> goals,
			v8::Local<v8::Function> room_callback,
			const search_options& options
		) -> std::optional<result>;

		auto is_in_use() const -> bool {
			return _is_in_use;
		}

		static auto load_terrain(v8::Local<v8::Object> world) -> void;
};

// path_iterator
class path_finder_t::path_iterator : public util::incrementable_facade {
	public:
		friend sentinel_path_iterator;
		using util::incrementable_facade::operator++;
		using value_type = world_position_t;

		constexpr path_iterator(const path_finder_t& pf, pos_index_t index) : pf_{pf}, index_{index} {}
		constexpr auto operator++() -> auto& { return (index_ = pf_.get().lookup(index_), *this); }
		constexpr auto operator==(const path_iterator& right) const -> bool { return index_ == right.index_; }
		// NOLINTNEXTLINE(cppcoreguidelines-slicing)
		constexpr auto operator*() const -> world_position_t { return indexed_position_t{pf_.get().room_table(), index_}; }

	private:
		std::reference_wrapper<const path_finder_t> pf_;
		pos_index_t index_;
};

// sentinel_path_iterator
class path_finder_t::sentinel_path_iterator {
	public:
		constexpr auto operator==(const path_iterator& right) const -> bool {
			return right.index_ == pos_index_t{std::numeric_limits<pos_index_t::value_type>::max()};
		}
};

using path_range_type = std::ranges::subrange<path_finder_t::path_iterator, path_finder_t::sentinel_path_iterator>;

// Options for `search`
struct path_finder_t::search_options {
		double heuristic_weight;
		cost_t plain_cost;
		cost_t swamp_cost;
		int max_ops;
		int max_rooms;
		unsigned max_cost;
		bool flee;
};

// Result of `search`
struct path_finder_t::result {
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

}; // namespace screeps

namespace js {

template <>
struct tagged_range<screeps::path_range_type> : std::type_identity<vector_tag> {};

} // namespace js
