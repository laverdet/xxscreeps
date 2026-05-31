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
// Stores information about a pathfinding goal, just a position + range
struct goal_t {
		cost_t range = 0;
		world_position_t pos{};
		explicit goal_t(v8::Local<v8::Value> goal) {
			v8::Local<v8::Object> obj = Nan::To<v8::Object>(goal).ToLocalChecked();
			range = Nan::To<cost_t>(Nan::Get(obj, Nan::New("range").ToLocalChecked()).ToLocalChecked()).FromJust();
			pos = world_position_t(Nan::Get(obj, Nan::New("pos").ToLocalChecked()).ToLocalChecked());
		}
};

//
// Path finder encapsulation. Multiple instances are thread-safe
export class path_finder_t {
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
		std::vector<goal_t> goals;
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
		auto pos_from_index(pos_index_t index) const -> world_position_t;
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
		auto search(
			world_position_t origin,
			v8::Local<v8::Array> goals_js,
			v8::Local<v8::Function> room_callback,
			cost_t plain_cost,
			cost_t swamp_cost,
			int max_rooms,
			int max_ops,
			unsigned max_cost,
			bool flee,
			double heuristic_weight
		) -> v8::Local<v8::Value>;

		auto is_in_use() const -> bool {
			return _is_in_use;
		}

		static void load_terrain(v8::Local<v8::Object> world);
};

}; // namespace screeps
