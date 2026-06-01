module;
#include <nan.h>
export module screeps;
export import :heap;
export import :open_closed;
export import :position;
export import :room;
export import :utility;
import std;

namespace screeps {

using pos_index_t = int;	// maximum: k_max_rooms * 2500
using room_index_t = int; // maximum: k_max_rooms (32 bits tested faster than uint8_t)
constexpr auto k_max_rooms = 64;

static_assert(std::numeric_limits<pos_index_t>::max() > 2'500 * k_max_rooms, "pos_index_t is too small");

//
// Path finder encapsulation. Multiple instances are thread-safe
export class path_finder_t {
	public:
		struct goal;
		struct result;
		class path_iterator;
		class sentinel_path_iterator;

	private:
		constexpr static size_t map_position_size = 1 << sizeof(room_location_t) * 8;
		constexpr static cost_t obstacle = std::numeric_limits<cost_t>::max();
		std::array<room_info_t, k_max_rooms> room_table;
		int room_table_size = 0;
		std::array<room_index_t, map_position_size> reverse_room_table;
		std::unordered_set<room_location_t, room_location_t::hash_t> blocked_rooms;
		std::array<pos_index_t, 2'500 * k_max_rooms> parents;
		open_closed_t<2'500 * k_max_rooms> open_closed;
		heap_t<pos_index_t, cost_t, 2'500 * k_max_rooms, 2'500 * k_max_rooms / 8> heap;
		std::vector<goal> goals;
		std::array<cost_t, 4> look_table = {{obstacle, obstacle, obstacle, obstacle}};
		double heuristic_weight;
		room_index_t max_rooms;
		bool flee;
		v8::Local<v8::Value>* room_data_handles;
		v8::Local<v8::Function>* room_callback;
		bool _is_in_use = false;

		static std::array<uint8_t*, map_position_size> terrain;

		class js_error : public std::runtime_error {
			public:
				js_error() : std::runtime_error("js error") {}
		};

		auto room_index_from_pos(room_location_t map_pos) -> room_index_t;
		auto index_from_pos(world_position_t pos) -> pos_index_t;
		void push_node(pos_index_t parent_index, world_position_t node, cost_t g_cost);

		auto look(world_position_t pos) -> cost_t;
		auto heuristic(world_position_t pos) const -> cost_t;

		void astar(pos_index_t index, world_position_t pos, cost_t g_cost);

		auto jump_x(cost_t cost, world_position_t pos, int dx) -> world_position_t;
		auto jump_y(cost_t cost, world_position_t pos, int dy) -> world_position_t;
		auto jump_xy(cost_t cost, world_position_t pos, int dx, int dy) -> world_position_t;
		auto jump(cost_t cost, world_position_t pos, int dx, int dy) -> world_position_t;
		void jps(pos_index_t index, world_position_t pos, cost_t g_cost);
		void jump_neighbor(world_position_t pos, pos_index_t index, world_position_t neighbor, cost_t g_cost, cost_t cost, cost_t n_cost);

	public:
		auto lookup(pos_index_t index) const -> pos_index_t { return parents[ index ]; };
		auto pos_from_index(pos_index_t index) const -> world_position_t;

		auto search(
			world_position_t origin,
			std::vector<path_finder_t::goal> goals,
			v8::Local<v8::Function> room_callback,
			cost_t plain_cost,
			cost_t swamp_cost,
			int max_rooms,
			int max_ops,
			unsigned max_cost,
			bool flee,
			double heuristic_weight
		) -> std::optional<result>;

		auto is_in_use() const -> bool {
			return _is_in_use;
		}

		static void load_terrain(v8::Local<v8::Object> world);
};

// Stores information about a pathfinding goal, just a position + range
struct path_finder_t::goal {
		cost_t range{};
		world_position_t pos{};

		constexpr static auto struct_template = js::struct_template{
			js::struct_member{util::cw<"pos">, &goal::pos},
			js::struct_member{util::cw<"range">, &goal::range},
		};
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
		constexpr auto operator*() const -> world_position_t { return pf_.get().pos_from_index(index_); }

	private:
		std::reference_wrapper<const path_finder_t> pf_;
		pos_index_t index_;
};

// sentinel_path_iterator
class path_finder_t::sentinel_path_iterator {
	public:
		constexpr auto operator==(const path_iterator& right) const -> bool {
			return right.index_ == std::numeric_limits<pos_index_t>::max();
		}
};

using path_range_type = std::ranges::subrange<path_finder_t::path_iterator, path_finder_t::sentinel_path_iterator>;

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
