module;
// Author: Marcel Laverdet <https://github.com/laverdet>
#include "nan.h"
module screeps;
import :utility;
import std;

using namespace screeps;

constexpr auto is_border_pos(int val) -> bool {
	return (val + 1) % 50 < 2;
}

constexpr auto is_near_border_pos(int val) -> bool {
	return (val + 2) % 50 < 4;
}

// Per-process terrain data
path_finder_t::terrain_map_type terrain_map;

// Return room index from a map position, allocates a new room index if needed and possible
auto path_finder_t::room_index_from_pos(room_location_t map_pos) -> room_index_t {
	auto room_index = room_table_.find(map_pos);
	if (room_index == room_scope_table::sentinel) {
		if (room_table_.size() >= max_rooms) {
			return room_index_sentinel;
		}
		if (blocked_rooms.contains(map_pos)) {
			return room_index_sentinel;
		}
		terrain_type terrain_ptr = terrain_map[ flatten(map_pos) ];
		if (terrain_ptr == nullptr) {
			blocked_rooms.insert(map_pos);
			return room_index_sentinel;
		}
		cost_matrix_type cost_matrix = nullptr;
		if (!room_callback_.IsEmpty()) {
			Nan::TryCatch try_catch;
			v8::Local<v8::Value> argv[ 1 ];
			argv[ 0 ] = Nan::New(flatten(map_pos));
			Nan::MaybeLocal<v8::Value> ret = Nan::Call(room_callback_, v8::Local<v8::Object>::Cast(Nan::Undefined()), 1, argv);
			if (try_catch.HasCaught()) {
				try_catch.ReThrow();
				throw js_error{};
			}
			if (!ret.IsEmpty()) {
				v8::Local<v8::Value> ret_local = ret.ToLocalChecked();
				if (ret_local->IsBoolean() && ret_local->IsFalse()) {
					blocked_rooms.insert(map_pos);
					return room_index_sentinel;
				}
				Nan::TypedArrayContents<uint8_t> cost_matrix_js{ret_local};
				if (cost_matrix_js.length() == 2'500) {
					cost_matrix = reinterpret_cast<cost_matrix_type>(*cost_matrix_js);
				}
			}
		}
		auto index = room_table_.insert(std::pair{map_pos, room_terrain{terrain_ptr, cost_matrix}});
		return room_index_t{index};
	} else {
		return room_index_t{room_index};
	}
}

// Conversions to/from index & world_position_t
auto path_finder_t::index_from_pos(world_position_t pos) -> pos_index_t {
	room_index_t room_index = room_index_from_pos(pos.room());
	if (room_index == room_index_sentinel) {
		throw std::runtime_error("Invalid invocation of index_from_pos");
	}
	return ((*room_index - 1) * 50 * 50) + (pos.yy % 50 * 50) + (pos.xx % 50);
}

auto path_finder_t::pos_from_index(pos_index_t index) const -> world_position_t {
	auto room_index = index / (50 * 50);
	auto location = room_table_[ room_index ].first;
	int coord = index - (room_index * 50 * 50);
	return {(coord % 50) + (location.xx * 50), (coord / 50) + (location.yy * 50)};
}

// Push a new node to the heap, or update its cost if it already exists
void path_finder_t::push_node(pos_index_t parent_index, world_position_t node, cost_t g_cost) {
	pos_index_t index = index_from_pos(node);
	if (open_closed.is_closed(index)) {
		return;
	}
	auto h_cost = static_cast<cost_t>(heuristic_(node) * heuristic_weight);
	auto f_cost = h_cost + g_cost;

	if (open_closed.is_open(index)) {
		if (heap.key_proj()(index) > f_cost) {
			heap.update(index, [ & ](auto& score) { return score[ index ] = f_cost; });
			parents[ index ] = parent_index;
			// std::cout <<"~ " <<node <<": h(" <<h_cost <<") + " <<"g(" <<g_cost <<") = f(" <<f_cost <<")\n";
		}
	} else {
		heap.push(index, [ & ](auto& score) { return score[ index ] = f_cost; });
		open_closed.open(index);
		parents[ index ] = parent_index;
		// std::cout <<"+ " <<node <<": h(" <<h_cost <<") + " <<"g(" <<g_cost <<") = f(" <<f_cost <<")\n";
	}
}

// Return cost of moving to a node
auto path_finder_t::look(world_position_t pos) -> cost_t {
	room_index_t room_index = room_index_from_pos(pos.room());
	if (room_index == room_index_sentinel) {
		return obstacle;
	}
	return room_table_[ *room_index - 1 ].second(look_table, pos.xx % 50, pos.yy % 50);
}

// Run an iteration of basic A*
void path_finder_t::astar(pos_index_t index, world_position_t pos, cost_t g_cost) {
	for (auto dir : contiguous_enum_range(direction_t::TOP, direction_t::TOP_LEFT)) {
		world_position_t neighbor = pos.position_in_direction(dir);

		// If this is a portal node there are some moves which will be impossible, and should be discarded
		if (pos.xx % 50 == 0) {
			if (
				(neighbor.xx % 50 == 49 && pos.yy != neighbor.yy) ||
				pos.xx == neighbor.xx
			) {
				continue;
			}
		} else if (pos.xx % 50 == 49) {
			if (
				(neighbor.xx % 50 == 0 && pos.yy != neighbor.yy) ||
				pos.xx == neighbor.xx
			) {
				continue;
			}
		} else if (pos.yy % 50 == 0) {
			if (
				(neighbor.yy % 50 == 49 && pos.xx != neighbor.xx) ||
				pos.yy == neighbor.yy
			) {
				continue;
			}
		} else if (pos.yy % 50 == 49) {
			if (
				(neighbor.yy % 50 == 0 && pos.xx != neighbor.xx) ||
				pos.yy == neighbor.yy
			) {
				continue;
			}
		}

		// Calculate cost of this move
		cost_t n_cost = look(neighbor);
		if (n_cost == obstacle) {
			// std::cout <<"# " <<neighbor <<"\n";
			continue;
		}
		push_node(index, neighbor, g_cost + n_cost);
	}
}

// JPS dragons
auto path_finder_t::jump_x(cost_t cost, world_position_t pos, int dx) -> world_position_t {
	cost_t prev_cost_u = look(world_position_t{pos.xx, pos.yy - 1});
	cost_t prev_cost_d = look(world_position_t{pos.xx, pos.yy + 1});
	while (true) {
		if (heuristic_(pos) == 0 || is_near_border_pos(pos.xx)) {
			break;
		}

		cost_t cost_u = look(world_position_t{pos.xx + dx, pos.yy - 1});
		cost_t cost_d = look(world_position_t{pos.xx + dx, pos.yy + 1});
		if (
			(cost_u != obstacle && prev_cost_u != cost) ||
			(cost_d != obstacle && prev_cost_d != cost)
		) {
			break;
		}
		prev_cost_u = cost_u;
		prev_cost_d = cost_d;
		pos.xx += dx;

		cost_t jump_cost = look(pos);
		if (jump_cost == obstacle) {
			pos = {};
			break;
		} else if (jump_cost != cost) {
			break;
		}
	}
	return pos;
}

auto path_finder_t::jump_y(cost_t cost, world_position_t pos, int dy) -> world_position_t {
	cost_t prev_cost_l = look(world_position_t{pos.xx - 1, pos.yy});
	cost_t prev_cost_r = look(world_position_t{pos.xx + 1, pos.yy});
	while (true) {
		if (heuristic_(pos) == 0 || is_near_border_pos(pos.yy)) {
			break;
		}

		cost_t cost_l = look(world_position_t{pos.xx - 1, pos.yy + dy});
		cost_t cost_r = look(world_position_t{pos.xx + 1, pos.yy + dy});
		if (
			(cost_l != obstacle && prev_cost_l != cost) ||
			(cost_r != obstacle && prev_cost_r != cost)
		) {
			break;
		}
		prev_cost_l = cost_l;
		prev_cost_r = cost_r;
		pos.yy += dy;

		cost_t jump_cost = look(pos);
		if (jump_cost == obstacle) {
			pos = {};
			break;
		} else if (jump_cost != cost) {
			break;
		}
	}
	return pos;
}

auto path_finder_t::jump_xy(cost_t cost, world_position_t pos, int dx, int dy) -> world_position_t {
	cost_t prev_cost_x = look(world_position_t{pos.xx - dx, pos.yy});
	cost_t prev_cost_y = look(world_position_t{pos.xx, pos.yy - dy});
	while (true) {
		if (heuristic_(pos) == 0 || is_near_border_pos(pos.xx) || is_near_border_pos(pos.yy)) {
			break;
		}

		if (
			(look(world_position_t{pos.xx - dx, pos.yy + dy}) != obstacle && prev_cost_x != cost) ||
			(look(world_position_t{pos.xx + dx, pos.yy - dy}) != obstacle && prev_cost_y != cost)
		) {
			break;
		}
		prev_cost_x = look(world_position_t{pos.xx, pos.yy + dy});
		prev_cost_y = look(world_position_t{pos.xx + dx, pos.yy});
		if (
			(prev_cost_y != obstacle && jump_x(cost, world_position_t{pos.xx + dx, pos.yy}, dx) != world_position_t{}) ||
			(prev_cost_x != obstacle && jump_y(cost, world_position_t{pos.xx, pos.yy + dy}, dy) != world_position_t{})
		) {
			break;
		}

		pos.xx += dx;
		pos.yy += dy;

		cost_t jump_cost = look(pos);
		if (jump_cost == obstacle) {
			pos = {};
			break;
		} else if (jump_cost != cost) {
			break;
		}
	}
	return pos;
}

auto path_finder_t::jump(cost_t cost, world_position_t pos, int dx, int dy) -> world_position_t {
	if (dx != 0) {
		if (dy != 0) {
			return jump_xy(cost, pos, dx, dy);
		} else {
			return jump_x(cost, pos, dx);
		}
	} else {
		return jump_y(cost, pos, dy);
	}
}

void path_finder_t::jps(pos_index_t index, world_position_t pos, cost_t g_cost) {
	world_position_t parent = pos_from_index(parents[ index ]);
	int dx = sign(pos.xx - parent.xx);
	int dy = sign(pos.yy - parent.yy);

	// First check to see if we're jumping to/from a border, options are limited in this case
	const auto push_neighbors = [ & ](auto... neighbors) {
		auto [... indices ] = util::sequence<sizeof...(neighbors)>;
		(..., [ & ](world_position_t neighbor) -> void {
			cost_t n_cost = look(neighbor);
			if (n_cost != obstacle) {
				push_node(index, neighbor, g_cost + n_cost);
			}
		}(neighbors...[ indices ]));
	};
	if (pos.xx % 50 == 0) {
		if (dx == -1) {
			push_neighbors(world_position_t{pos.xx - 1, pos.yy});
			return;
		} else if (dx == 1) {
			push_neighbors(
				world_position_t{pos.xx + 1, pos.yy - 1},
				world_position_t{pos.xx + 1, pos.yy},
				world_position_t{pos.xx + 1, pos.yy + 1}
			);
			return;
		}
	} else if (pos.xx % 50 == 49) {
		if (dx == 1) {
			push_neighbors(world_position_t{pos.xx + 1, pos.yy});
			return;
		} else if (dx == -1) {
			push_neighbors(
				world_position_t{pos.xx - 1, pos.yy - 1},
				world_position_t{pos.xx - 1, pos.yy},
				world_position_t{pos.xx - 1, pos.yy + 1}
			);
			return;
		}
	} else if (pos.yy % 50 == 0) {
		if (dy == -1) {
			push_neighbors(world_position_t{pos.xx, pos.yy - 1});
			return;
		} else if (dy == 1) {
			push_neighbors(
				world_position_t{pos.xx - 1, pos.yy + 1},
				world_position_t{pos.xx, pos.yy + 1},
				world_position_t{pos.xx + 1, pos.yy + 1}
			);
			return;
		}
	} else if (pos.yy % 50 == 49) {
		if (dy == 1) {
			push_neighbors(world_position_t{pos.xx, pos.yy + 1});
			return;
		} else if (dy == -1) {
			push_neighbors(
				world_position_t{pos.xx - 1, pos.yy - 1},
				world_position_t{pos.xx, pos.yy - 1},
				world_position_t{pos.xx + 1, pos.yy - 1}
			);
			return;
		}
	}

	// Regular JPS iteration follows

	// First check to see if we're close to borders
	int border_dx = 0;
	if (pos.xx % 50 == 1) {
		border_dx = -1;
	} else if (pos.xx % 50 == 48) {
		border_dx = 1;
	}
	int border_dy = 0;
	if (pos.yy % 50 == 1) {
		border_dy = -1;
	} else if (pos.yy % 50 == 48) {
		border_dy = 1;
	}

	// Now execute the logic that is shared between diagonal and straight jumps
	cost_t cost = look(pos);
	if (dx != 0) {
		world_position_t neighbor = world_position_t{pos.xx + dx, pos.yy};
		cost_t n_cost = look(neighbor);
		if (n_cost != obstacle) {
			if (border_dy == 0) {
				jump_neighbor(pos, index, neighbor, g_cost, cost, n_cost);
			} else {
				push_node(index, neighbor, g_cost + n_cost);
			}
		}
	}
	if (dy != 0) {
		world_position_t neighbor = world_position_t{pos.xx, pos.yy + dy};
		cost_t n_cost = look(neighbor);
		if (n_cost != obstacle) {
			if (border_dx == 0) {
				jump_neighbor(pos, index, neighbor, g_cost, cost, n_cost);
			} else {
				push_node(index, neighbor, g_cost + n_cost);
			}
		}
	}

	// Forced neighbor rules
	if (dx != 0) {
		if (dy != 0) { // Jumping diagonally
			world_position_t neighbor = world_position_t{pos.xx + dx, pos.yy + dy};
			cost_t n_cost = look(neighbor);
			if (n_cost != obstacle) {
				jump_neighbor(pos, index, neighbor, g_cost, cost, n_cost);
			}
			if (look(world_position_t{pos.xx - dx, pos.yy}) != cost) {
				jump_neighbor(pos, index, world_position_t{pos.xx - dx, pos.yy + dy}, g_cost, cost, look(world_position_t{pos.xx - dx, pos.yy + dy}));
			}
			if (look(world_position_t{pos.xx, pos.yy - dy}) != cost) {
				jump_neighbor(pos, index, world_position_t{pos.xx + dx, pos.yy - dy}, g_cost, cost, look(world_position_t{pos.xx + dx, pos.yy - dy}));
			}
		} else { // Jumping left / right
			if (border_dy == 1 || look(world_position_t{pos.xx, pos.yy + 1}) != cost) {
				jump_neighbor(pos, index, world_position_t{pos.xx + dx, pos.yy + 1}, g_cost, cost, look(world_position_t{pos.xx + dx, pos.yy + 1}));
			}
			if (border_dy == -1 || look(world_position_t{pos.xx, pos.yy - 1}) != cost) {
				jump_neighbor(pos, index, world_position_t{pos.xx + dx, pos.yy - 1}, g_cost, cost, look(world_position_t{pos.xx + dx, pos.yy - 1}));
			}
		}
	} else { // Jumping up / down
		if (border_dx == 1 || look(world_position_t{pos.xx + 1, pos.yy}) != cost) {
			jump_neighbor(pos, index, world_position_t{pos.xx + 1, pos.yy + dy}, g_cost, cost, look(world_position_t{pos.xx + 1, pos.yy + dy}));
		}
		if (border_dx == -1 || look(world_position_t{pos.xx - 1, pos.yy}) != cost) {
			jump_neighbor(pos, index, world_position_t{pos.xx - 1, pos.yy + dy}, g_cost, cost, look(world_position_t{pos.xx - 1, pos.yy + dy}));
		}
	}
}

void path_finder_t::jump_neighbor(world_position_t pos, pos_index_t index, world_position_t neighbor, cost_t g_cost, cost_t cost, cost_t n_cost) {
	if (n_cost != cost || is_border_pos(neighbor.xx) || is_border_pos(neighbor.yy)) {
		if (n_cost == obstacle) {
			return;
		}
		g_cost += n_cost;
	} else {
		neighbor = jump(n_cost, neighbor, neighbor.xx - pos.xx, neighbor.yy - pos.yy);
		if (neighbor == world_position_t{}) {
			return;
		}
		g_cost += (n_cost * (pos.range_to(neighbor) - 1)) + look(neighbor);
	}

	push_node(index, neighbor, g_cost);
}

auto path_finder_t::search(
	world_position_t origin,
	std::vector<heuristic_t::goal_t> goals,
	v8::Local<v8::Function> room_callback,
	const search_options& options
) -> std::optional<result> {

	// Clean up from previous iteration
	room_table_.clear();
	blocked_rooms.clear();
	open_closed.clear();
	heap.clear();

	if (room_callback->IsUndefined()) {
		room_callback_ = {};
	} else {
		room_callback_ = room_callback;
	}

	// Other initialization
	heuristic_.reset(std::move(goals), options.flee);
	look_table[ 0 ] = options.plain_cost;
	look_table[ 2 ] = options.swamp_cost;
	this->max_rooms = options.max_rooms;
	this->heuristic_weight = options.heuristic_weight;
	uint32_t ops_remaining = options.max_ops;
	cost_t min_node_h_cost = std::numeric_limits<cost_t>::max();
	cost_t min_node_g_cost = std::numeric_limits<cost_t>::max();
	pos_index_t min_node = 0;

	// Special case for searching to same node, otherwise it searches everywhere because origin node
	// is closed
	if (heuristic_(origin) == 0) {
		return result{
			.path = std::ranges::subrange{
				path_iterator{*this, std::numeric_limits<pos_index_t>::max()},
				sentinel_path_iterator{},
			},
			.cost = 0,
			.ops = 0,
			.incomplete = false,
		};
	}

	_is_in_use = true;
	try {
		// Prime data for `index_from_pos`
		if (room_index_from_pos(origin.room()) == room_index_sentinel) {
			// Initial room is inaccessible
			_is_in_use = false;
			return result{
				.path = std::ranges::subrange{
					path_iterator{*this, std::numeric_limits<pos_index_t>::max()},
					sentinel_path_iterator{},
				},
				.cost = 0,
				.ops = 0,
				.incomplete = true,
			};
		}

		// Initial A* iteration
		min_node = index_from_pos(origin);
		open_closed.close(min_node);
		parents[ min_node ] = std::numeric_limits<pos_index_t>::max();
		astar(min_node, origin, 0);

		// Loop until we have a solution
		while (!heap.empty() && ops_remaining > 0) {

			// Pull cheapest open node off the heap and close the node
			auto current = heap.top();
			auto score = heap.key_proj()(current);
			heap.pop();
			open_closed.close(current);

			// Calculate costs
			world_position_t pos = pos_from_index(current);
			cost_t h_cost = heuristic_(pos);
			cost_t g_cost = score - cost_t(h_cost * heuristic_weight);
			// std::cout << "\n* " << pos << ": h(" << h_cost << ") + " << "g(" << g_cost << ") = f(" << score << ")\n";

			// Reached destination?
			if (h_cost == 0) {
				min_node = current;
				min_node_h_cost = 0;
				min_node_g_cost = g_cost;
				break;
			} else if (h_cost < min_node_h_cost) {
				min_node = current;
				min_node_h_cost = h_cost;
				min_node_g_cost = g_cost;
			}
			if (static_cast<unsigned>(g_cost + h_cost) > options.max_cost) {
				break;
			}

			// Add next neighbors to heap
			jps(current, pos, g_cost);
			--ops_remaining;

			// Check termination
			if (v8::Isolate::GetCurrent()->IsExecutionTerminating()) {
				_is_in_use = false;
				return std::nullopt;
			}
		}
	} catch (const js_error&) {
		// Whoever threw the `js_error` should set the exception for v8
		_is_in_use = false;
		return std::nullopt;
	}

	// Reconstruct path from A* graph
	_is_in_use = false;
	return result{
		.path = std::ranges::subrange{
			path_iterator{*this, min_node},
			sentinel_path_iterator{},
		},
		.cost = min_node_g_cost,
		.ops = static_cast<int>(options.max_ops - ops_remaining),
		.incomplete = min_node_h_cost != 0,
	};
}

// Loads static terrain data into module upfront
std::mutex terrain_lock;
void path_finder_t::load_terrain(v8::Local<v8::Object> world) {
	// Save reference to this data
	std::lock_guard<std::mutex> lock{terrain_lock};
	static Nan::Persistent<v8::Object> handle;
	handle.Reset(world);
	// Parse out terrain by rooms
	auto keys = Nan::GetOwnPropertyNames(world).ToLocalChecked();
	for (uint32_t ii = 0; ii < keys->Length(); ++ii) {
		auto name = Nan::Get(keys, ii).ToLocalChecked();
		auto id = Nan::To<uint32_t>(name).FromJust();
		auto terrain = Nan::Get(world, name).ToLocalChecked();
		terrain_map[ id ] = *Nan::TypedArrayContents<uint8_t>(terrain);
	}
}
