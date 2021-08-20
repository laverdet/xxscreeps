// Author: Marcel Laverdet <https://github.com/laverdet>
#include <nan.h>
#include <array>
#include <iostream>
#include <limits>
#include <memory>
#include <stdexcept>
#include <unordered_set>
#include <vector>

namespace screeps {
	using cost_t = int; // maximum: longest chebyshev distance of whole map
	using pos_index_t = int; // maximum: k_max_rooms * 2500
	using room_index_t = int; // maximum: k_max_rooms (32 bits tested faster than uint8_t)
	constexpr auto k_max_rooms = 64;

	static_assert(std::numeric_limits<pos_index_t>::max() > 2500 * k_max_rooms, "pos_index_t is too small");

	//
	// Safely converts an arbitrary position struct into a word
	template <int> struct int_for_size;
	template <> struct int_for_size<2> { using int_t = uint16_t; };
	template <> struct int_for_size<4> { using int_t = uint32_t; };
	template <> struct int_for_size<8> { using int_t = uint64_t; };

	template <class Type>
	constexpr auto flatten(Type location) {
		union union_t {
			constexpr explicit union_t(Type location) : location{location} {}
			Type location;
			typename int_for_size<sizeof(location)>::int_t integer;
		};
		return union_t{location}.integer;
	}

	template <class Type, class Integral>
	constexpr auto unflatten(Integral integer) {
		union union_t {
			constexpr explicit union_t(Integral integer) : integer{integer} {}
			Type location;
			typename int_for_size<sizeof(Type)>::int_t integer;
		};
		return union_t{integer}.location;
	}

	//
	// Similar to a RoomPosition object, but stores coordinates in a continuous global plane.
	// Conversions to/from this coordinate plane are handled on the JS side
	struct world_position_t {
		int xx, yy; // maximum: world_size[255] * 50 (32 bits tested faster than uint16_t)

		enum direction_t { TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT };

		world_position_t() = default;
		world_position_t(int xx, int yy) : xx{xx}, yy{yy} {}
		explicit world_position_t(v8::Local<v8::Value> pos) {
			auto value = Nan::To<int32_t>(pos.As<v8::Number>()).FromJust();
			xx = ((value >> 16) & 0xff) + (value & 0xff) * 50;
			yy = ((value >> 24) & 0xff) + ((value >> 8) & 0xff) * 50;
		}

		explicit operator v8::Local<v8::Value>() {
			return Nan::New((yy % 50) << 24 | (xx % 50) << 16 | (yy / 50) << 8 | xx / 50);
		}

		static auto null() -> world_position_t {
			return unflatten<world_position_t>(0U);
		}

		friend auto operator<<(std::ostream& os, const world_position_t& that) -> std::ostream& {
			int xx = static_cast<int>(that.xx / 50);
			int yy = static_cast<int>(that.yy / 50);
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

		auto operator!=(world_position_t right) const -> bool {
			return flatten(*this) != flatten(right);
		}

		auto is_null() const -> bool {
			return flatten(*this) == 0;
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
			int dx = pos.xx - xx;
			int dy = pos.yy - yy;
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
			return std::max(std::abs(pos.xx - xx), std::abs(pos.yy - yy));
		}
	};

	//
	// Stores coordinates of a room on the global world map.
	// For instance, "E1N1" -> { xx: 129, yy: 126 } -- this is implemented in JS
	struct room_location_t {
		uint8_t xx, yy;

		room_location_t() = default;
		explicit room_location_t(world_position_t pos) :
			xx{static_cast<uint8_t>(pos.xx / 50U)},
			yy{static_cast<uint8_t>(pos.yy / 50U)} {}

		auto operator==(room_location_t right) const -> bool {
			return flatten(*this) == flatten(right);
		}

		auto operator<(room_location_t right) const -> bool {
			return flatten(*this) < flatten(right);
		}

		struct hash_t {
			auto operator()(const room_location_t& val) const -> size_t {
				return std::hash<int16_t>()(flatten(val));
			}
		};
	};

	//
	// Simple open-closed list
	template <size_t capacity>
	class open_closed_t {
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

		private:
			using marker_t = uint32_t;
			std::array<marker_t, capacity> list{};
			marker_t marker = 1;
	};

	//
	// Stores context about a room, specific to each search
	struct room_info_t {
		uint8_t* terrain;
		uint8_t (*cost_matrix)[50];
		room_location_t pos;
		static uint8_t cost_matrix0[2500];

		room_info_t() = default;
		room_info_t(uint8_t* terrain, uint8_t* cost_matrix, room_location_t pos) :
			terrain{terrain},
			cost_matrix{(uint8_t(*)[50])(cost_matrix == nullptr ? cost_matrix0 : cost_matrix)},
			pos{pos} {}

		auto terrain_look(unsigned xx, unsigned yy) const -> uint8_t {
			unsigned index = yy * 50 + xx;
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

		private:
			std::array<priority_t, capacity> priorities;
			// Theoretical max number of open nodes is total node divided by 8. 1 node opens all its
			// neighbors repeated perfectly over the whole graph. It's impossible to actually hit this
			// limit with a regular pathfinder operation
			std::array<index_t, 2500 * k_max_rooms / 8> heap;
			size_t size_ = 0;
	};

	//
	// Path finder encapsulation. Multiple instances are thread-safe
	class path_finder_t {
		private:
			static constexpr size_t map_position_size = 1 << sizeof(room_location_t) * 8;
			static constexpr cost_t obstacle = std::numeric_limits<cost_t>::max();
			std::array<room_info_t, k_max_rooms> room_table;
			int room_table_size = 0;
			std::array<room_index_t, map_position_size> reverse_room_table;
			std::unordered_set<room_location_t, room_location_t::hash_t> blocked_rooms;
			std::array<pos_index_t, 2500 * k_max_rooms> parents;
			open_closed_t<2500 * k_max_rooms> open_closed;
			heap_t<pos_index_t, cost_t, 2500 * k_max_rooms> heap;
			std::vector<goal_t> goals;
			std::array<cost_t, 4> look_table = {{obstacle, obstacle, obstacle, obstacle}};
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
				v8::Local<v8::Value> origin_js, v8::Local<v8::Array> goals_js,
				v8::Local<v8::Function> room_callback,
				cost_t plain_cost, cost_t swamp_cost,
				int max_rooms, int max_ops, unsigned max_cost,
				bool flee,
				double heuristic_weight
			) -> v8::Local<v8::Value>;

			auto is_in_use() const -> bool {
				return _is_in_use;
			}

			static void load_terrain(v8::Local<v8::Object> world);
	};
};
