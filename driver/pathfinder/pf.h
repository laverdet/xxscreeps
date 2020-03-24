// Author: Marcel Laverdet <https://github.com/laverdet>
#include <nan.h>
#include <array>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <unordered_set>
#include <vector>

namespace screeps {
	using cost_t = uint32_t; // maximum: longest chebyshev distance of whole map
	using pos_index_t = uint32_t; // maximum: k_max_rooms * 2500
	using room_index_t = uint32_t; // maximum: k_max_rooms (32 bits tested faster than uint8_t)
	constexpr size_t k_max_rooms = 64;

	static_assert(std::numeric_limits<pos_index_t>::max() > 2500 * k_max_rooms, "pos_index_t is too small");

	//
	// Stores coordinates of a room on the global world map.
	// For instance, "E1N1" -> { xx: 129, yy: 126 } -- this is implemented in JS
	struct map_position_t {

		union {
			uint16_t id = 0;
			struct {
				uint8_t xx, yy; // maximum: world_size
			};
		};

		map_position_t() = default;

		map_position_t(uint8_t xx, uint8_t yy) : xx{xx}, yy{yy} {}

		explicit map_position_t(v8::Local<v8::Value> pos) {
			v8::Local<v8::Object> obj = Nan::To<v8::Object>(pos).ToLocalChecked();
			xx = Nan::To<uint32_t>(Nan::Get(obj, Nan::New("xx").ToLocalChecked()).ToLocalChecked()).FromJust();
			yy = Nan::To<uint32_t>(Nan::Get(obj, Nan::New("yy").ToLocalChecked()).ToLocalChecked()).FromJust();
		}

		auto operator== (map_position_t right) const -> bool {
			return this->id == right.id;
		}

		auto operator< (map_position_t right) const -> bool {
			return this->id < right.id;
		}

		struct hash_t {
			auto operator()(const map_position_t& val) const -> size_t {
				return std::hash<uint16_t>()(val.id);
			}
		};
	};


	//
	// Similar to a RoomPosition object, but stores coordinates in a continuous global plane.
	// Conversions to/from this coordinate plane are handled on the JS side
	class world_position_t {

		public:
			union {
				uint64_t id = 0;
				struct {
					uint32_t xx, yy; // maximum: world_size[255] * 50 (32 bits tested faster than uint16_t)
				};
			};

			enum direction_t { TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT };

			world_position_t() = default;

			world_position_t(uint32_t xx, uint32_t yy) : xx{xx}, yy{yy} {}

			explicit world_position_t(uint64_t id) : id{id} {}

			explicit world_position_t(v8::Local<v8::Value> pos) {
				v8::Local<v8::Object> obj = Nan::To<v8::Object>(pos).ToLocalChecked();
				xx = Nan::To<uint32_t>(Nan::Get(obj, Nan::New("xx").ToLocalChecked()).ToLocalChecked()).FromJust();
				yy = Nan::To<uint32_t>(Nan::Get(obj, Nan::New("yy").ToLocalChecked()).ToLocalChecked()).FromJust();
			}

			static auto null() -> world_position_t {
				return world_position_t(0);
			}

			friend auto operator<< (std::ostream& os, const world_position_t& that) -> std::ostream& {
				int xx = that.xx / 50;
				int yy = that.yy / 50;
				bool w = xx <= 127;
				bool n = yy <= 127;
				os <<"world_position_t(["
					<<(w ? 'W' : 'E')
					<<(w ? 127 - xx : xx - 128)
					<<(n ? 'N' : 'S')
					<<(n ? 127 - yy : yy - 128)
					<<"] " <<that.xx % 50 <<", " <<that.yy % 50 <<")";
				return os;
			}

			auto operator!= (world_position_t right) const -> bool {
				return id != right.id;
			}

			auto is_null() const -> bool {
				return id == 0;
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
				int dx = pos.xx - this->xx;
				int dy = pos.yy - this->yy;
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
				return std::max(
					pos.xx > this->xx ? pos.xx - this->xx : this->xx - pos.xx,
					pos.yy > this->yy ? pos.yy - this->yy : this->yy - pos.yy
				);
			}

			auto map_position() const -> map_position_t {
				return map_position_t(xx / 50, yy / 50);
			}
	};

	//
	// Simple open-closed list
	template <size_t capacity>
	class open_closed_t {

		private:
			using marker_t = uint32_t;
			std::array<marker_t, capacity> list{};
			marker_t marker = 1;

		public:
			void clear() {
				if (std::numeric_limits<marker_t>::max() - 2 <= marker) {
					std::fill(list.begin(), list.end(), 0);
					marker = 1;
				} else {
					marker += 2;
				}
			}

			auto is_open(size_t index) const -> bool {
				return list[index] == marker;
			}

			auto is_closed(size_t index) const -> bool {
				return list[index] == marker + 1;
			}

			void open(size_t index) {
				list[index] = marker;
			}

			void close(size_t index) {
				list[index] = marker + 1;
			}
	};

	//
	// Stores context about a room, specific to each search
	struct room_info_t {
		uint8_t* terrain;
		uint8_t (*cost_matrix)[50];
		map_position_t pos;
		static uint8_t cost_matrix0[2500];

		room_info_t() = default;

		room_info_t(uint8_t* terrain, uint8_t* cost_matrix, map_position_t pos) :
			terrain{terrain},
			cost_matrix{(uint8_t(*)[50])(cost_matrix == nullptr ? cost_matrix0 : cost_matrix)},
			pos{pos}
			{
		}

		auto look(uint8_t xx, uint8_t yy) const -> uint8_t {
			if (cost_matrix[xx][yy] != 0) {
				return cost_matrix[xx][yy];
			}
			unsigned int index = xx * 50 + yy;
			return 0x03 & terrain[index / 4] >> (index % 4 * 2);
		}
	};

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
	// Priority queue implementation w/ support for updating priorities
	template <class index_t, class priority_t, size_t capacity>
	class heap_t {

		private:
			std::array<priority_t, capacity> priorities;
			// Theoretical max number of open nodes is total node divided by 8. 1 node opens all its
			// neighbors repeated perfectly over the whole graph. It's impossible to actually hit this
			// limit with a regular pathfinder operation
			std::array<index_t, 2500 * k_max_rooms / 8> heap;
			size_t size_ = 0;

		public:
			heap_t() = default;

			auto empty() const -> bool {
				return size_ == 0;
			}

			auto priority(index_t index) const -> priority_t {
				return priorities[index];
			}

			auto pop() -> std::pair<index_t, priority_t> {
				std::pair<index_t, priority_t> ret(heap[1], priorities[heap[1]]);
				heap[1] = heap[size_];
				--size_;
				size_t vv = 1;
				do {
					size_t uu = vv;
					if ((uu << 1) + 1 <= size_) {
						if (priorities[heap[uu]] >= priorities[heap[uu << 1]]) {
							vv = uu << 1;
						}
						if (priorities[heap[vv]] >= priorities[heap[(uu << 1) + 1]]) {
							vv = (uu << 1) + 1;
						}
					} else if (uu << 1 <= size_) {
						if (priorities[heap[uu]] >= priorities[heap[uu << 1]]) {
							vv = uu << 1;
						}
					}
					if (uu != vv) {
						std::swap(heap[uu], heap[vv]);
					} else {
						break;
					}
				} while(true);
				return ret;
			}

			void insert(index_t index, priority_t priority) {
				if (size_ == heap.size() - 1) {
					throw std::runtime_error("Max heap");
				}
				priorities[index] = priority;
				++size_;
				heap[size_] = index;
				bubble_up(size_);
			}

			void update(index_t index, priority_t priority) {
				for (size_t ii = size_; ii > 0; --ii) {
					if (heap[ii] == index) {
						priorities[index] = priority;
						bubble_up(ii);
						return;
					}
				}
			}

			void bubble_up(size_t ii) {
				while (ii != 1) {
					if (priorities[heap[ii]] <= priorities[heap[ii >> 1]]) {
						std::swap(heap[ii], heap[ii >> 1]);
						ii = ii >> 1;
					} else {
						return;
					}
				}
			}

			void clear() {
				size_ = 0;
			}
	};

	//
	// Path finder encapsulation. Multiple instances are thread-safe
	class path_finder_t {
		private:
			static constexpr size_t map_position_size = 1 << sizeof(map_position_t) * 8;
			static constexpr cost_t obstacle = std::numeric_limits<cost_t>::max();
			std::array<room_info_t, k_max_rooms> room_table;
			size_t room_table_size = 0;
			std::array<room_index_t, map_position_size> reverse_room_table;
			std::unordered_set<map_position_t, map_position_t::hash_t> blocked_rooms;
			std::array<pos_index_t, 2500 * k_max_rooms> parents;
			open_closed_t<2500 * k_max_rooms> open_closed;
			heap_t<pos_index_t, cost_t, 2500 * k_max_rooms> heap;
			std::vector<goal_t> goals;
			std::array<cost_t, 4> look_table = {obstacle, obstacle, obstacle, obstacle};
			double heuristic_weight;
			room_index_t max_rooms;
			bool flee;
			v8::Local<v8::Value>* room_data_handles;
			v8::Local<v8::Function>* room_callback;
			bool _is_in_use = false;

			static std::array<uint8_t*, map_position_size> terrain;

			class js_error: public std::runtime_error {
				public: js_error() : std::runtime_error("js error") {}
			};

			auto room_index_from_pos(map_position_t map_pos) -> room_index_t;
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
				v8::Local<v8::Value> origin_js, v8::Local<v8::Array> goals_js,
				v8::Local<v8::Function> room_callback,
				cost_t plain_cost, cost_t swamp_cost,
				uint8_t max_rooms, uint32_t max_ops, uint32_t max_cost,
				bool flee,
				double heuristic_weight
			) -> v8::Local<v8::Value>;

			auto is_in_use() const -> bool {
				return _is_in_use;
			}

			static void load_terrain(v8::Local<v8::Array> terrain);
	};
};
