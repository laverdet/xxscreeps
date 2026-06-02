module;
// Author: Marcel Laverdet <https://github.com/laverdet>
#include "nan.h"
#include <cassert>
module screeps;
import :utility;
import std;

using namespace screeps;

// Per-process terrain data
path_finder_t::terrain_map_type terrain_map;

// Return room index from a map position, allocates a new room index if needed and possible
auto path_finder_t::room_index_from_location(room_location_t location) -> room_index_t {
	auto room_index = room_table_.find(location);
	if (room_index == room_scope_table::sentinel) {
		if (room_table_.size() >= max_rooms) {
			return room_index_sentinel;
		}
		if (blocked_rooms.contains(location)) {
			return room_index_sentinel;
		}
		terrain_type terrain_ptr = terrain_map[ flatten(location) ];
		if (terrain_ptr == nullptr) {
			blocked_rooms.insert(location);
			return room_index_sentinel;
		}
		cost_matrix_type cost_matrix = nullptr;
		if (!room_callback_.IsEmpty()) {
			Nan::TryCatch try_catch;
			v8::Local<v8::Value> argv[ 1 ];
			argv[ 0 ] = Nan::New(flatten(location));
			Nan::MaybeLocal<v8::Value> ret = Nan::Call(room_callback_, v8::Local<v8::Object>::Cast(Nan::Undefined()), 1, argv);
			if (try_catch.HasCaught()) {
				try_catch.ReThrow();
				throw js_error{};
			}
			if (!ret.IsEmpty()) {
				v8::Local<v8::Value> ret_local = ret.ToLocalChecked();
				if (ret_local->IsBoolean() && ret_local->IsFalse()) {
					blocked_rooms.insert(location);
					return room_index_sentinel;
				}
				Nan::TypedArrayContents<uint8_t> cost_matrix_js{ret_local};
				if (cost_matrix_js.length() == 2'500) {
					cost_matrix = reinterpret_cast<cost_matrix_type>(*cost_matrix_js);
				}
			}
		}
		auto index = room_table_.insert(std::pair{location, room_terrain{terrain_ptr, cost_matrix}});
		return room_index_t{index};
	} else {
		return room_index_t{room_index};
	}
}

// Conversions to/from index & world_position_t
auto path_finder_t::index_from_pos(world_position_t pos) -> indexed_position_t {
	room_index_t room_index = room_index_from_location(pos.room());
	if (room_index == room_index_sentinel) {
		throw std::runtime_error("Invalid invocation of index_from_pos");
	}
	return indexed_position_t{room_index, pos};
}

// Push a new node to the heap, or update its cost if it already exists
auto path_finder_t::push_node(indexed_position_t node, pos_index_t parent_index, cost_t g_cost) -> void {
	auto index = pos_index_t{node};
	if (open_closed.is_closed(*index)) {
		return;
	}
	auto h_cost = static_cast<cost_t>(heuristic_(node) * heuristic_weight);
	auto f_cost = h_cost + g_cost;

	if (open_closed.is_open(*index)) {
		if (heap.key_proj()(*index) > f_cost) {
			heap.update(*index, [ & ](auto& score) { return score[ *index ] = f_cost; });
			parents[ *index ] = parent_index;
			// std::print("~ {}: h({}) + g({}) = f({})\n", node, h_cost, g_cost, f_cost);
		}
	} else {
		heap.push(*index, [ & ](auto& score) { return score[ *index ] = f_cost; });
		open_closed.open(*index);
		parents[ *index ] = parent_index;
		// std::print("+ {}: h({}) + g({}) = f({})\n", node, h_cost, g_cost, f_cost);
	}
}

// Return cost of moving to a node
auto path_finder_t::look(indexed_position_t pos) -> cost_t {
	return room_table_[ *pos.room_index - 1 ].second(look_table, pos.xx % 50, pos.yy % 50);
}

// Look, and also potentially open up a new room
auto path_finder_t::look_open(world_position_t pos) -> std::pair<room_index_t, cost_t> {
	room_index_t room_index = room_index_from_location(pos.room());
	if (room_index == room_index_sentinel) {
		return {room_index_sentinel, obstacle};
	}
	auto cost = room_table_[ *room_index - 1 ].second(look_table, pos.xx % 50, pos.yy % 50);
	return {room_index, cost};
}

// Run an iteration of basic A*
auto path_finder_t::astar(const indexed_position_t pos, const pos_index_t index, cost_t g_cost) -> void {
	assert(pos_index_t{pos} == index);
	for (auto dir : contiguous_enum_range(direction_t::TOP, direction_t::TOP_LEFT)) {
		auto neighbor = pos.position_in_direction(dir);

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
		auto [ room_index, n_cost ] = look_open(neighbor);
		if (n_cost == obstacle) {
			// std::print("# {}\n", neighbor);
			continue;
		}
		push_node({room_index, neighbor}, index, g_cost + n_cost);
	}
}

// JPS dragons
auto path_finder_t::jump_x(indexed_position_t pos, int dx, cost_t cost) -> indexed_position_t {
	cost_t prev_cost_u = look(pos.translate(0, -1));
	cost_t prev_cost_d = look(pos.translate(0, 1));
	while (true) {
		if (heuristic_(pos) == 0 || is_near_border_coord(pos.xx)) {
			break;
		}

		cost_t cost_u = look(pos.translate(dx, -1));
		cost_t cost_d = look(pos.translate(dx, 1));
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

auto path_finder_t::jump_y(indexed_position_t pos, int dy, cost_t cost) -> indexed_position_t {
	cost_t prev_cost_l = look(pos.translate(-1, 0));
	cost_t prev_cost_r = look(pos.translate(1, 0));
	while (true) {
		if (heuristic_(pos) == 0 || is_near_border_coord(pos.yy)) {
			break;
		}

		cost_t cost_l = look(pos.translate(-1, dy));
		cost_t cost_r = look(pos.translate(1, dy));
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

auto path_finder_t::jump_xy(indexed_position_t pos, int dx, int dy, cost_t cost) -> indexed_position_t {
	cost_t prev_cost_x = look(pos.translate(-dx, 0));
	cost_t prev_cost_y = look(pos.translate(0, -dy));
	while (true) {
		if (heuristic_(pos) == 0 || is_near_border_coord(pos.xx) || is_near_border_coord(pos.yy)) {
			break;
		}

		if (
			(look(pos.translate(-dx, dy)) != obstacle && prev_cost_x != cost) ||
			(look(pos.translate(dx, -dy)) != obstacle && prev_cost_y != cost)
		) {
			break;
		}
		prev_cost_x = look(pos.translate(0, dy));
		prev_cost_y = look(pos.translate(dx, 0));
		if (
			(prev_cost_y != obstacle && jump_x(pos.translate(dx, 0), dx, cost) != indexed_position_t{}) ||
			(prev_cost_x != obstacle && jump_y(pos.translate(0, dy), dy, cost) != indexed_position_t{})
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

auto path_finder_t::jump(indexed_position_t pos, int dx, int dy, cost_t cost) -> indexed_position_t {
	if (dx != 0) {
		if (dy != 0) {
			return jump_xy(pos, dx, dy, cost);
		} else {
			return jump_x(pos, dx, cost);
		}
	} else {
		return jump_y(pos, dy, cost);
	}
}

auto path_finder_t::jps(const indexed_position_t pos, const pos_index_t index, cost_t g_cost) -> void {
	assert(pos_index_t{pos} == index);
	auto parent = indexed_position_t{room_table_, parents[ *index ]};
	int dx = sign(pos.xx - parent.xx);
	int dy = sign(pos.yy - parent.yy);

	// First check to see if we're jumping to/from a border, options are limited in this case
	const auto push_neighbors = [ & ](auto... neighbors) {
		auto [... indices ] = util::sequence<sizeof...(neighbors)>;
		(..., [ & ](world_position_t neighbor) -> void {
			auto [ room_index, n_cost ] = look_open(neighbor);
			if (n_cost != obstacle) {
				push_node({room_index, neighbor}, index, g_cost + n_cost);
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
		auto neighbor = pos.translate(dx, 0);
		auto n_cost = look(neighbor);
		if (n_cost != obstacle) {
			if (border_dy == 0) {
				jump_neighbor(neighbor, pos, index, g_cost, cost, n_cost);
			} else {
				push_node(neighbor, index, g_cost + n_cost);
			}
		}
	}
	if (dy != 0) {
		auto neighbor = pos.translate(0, dy);
		auto n_cost = look(neighbor);
		if (n_cost != obstacle) {
			if (border_dx == 0) {
				jump_neighbor(neighbor, pos, index, g_cost, cost, n_cost);
			} else {
				push_node(neighbor, index, g_cost + n_cost);
			}
		}
	}

	// Forced neighbor rules
	if (dx != 0) {
		if (dy != 0) { // Jumping diagonally
			auto neighbor = pos.translate(dx, dy);
			auto n_cost = look(neighbor);
			if (n_cost != obstacle) {
				jump_neighbor(neighbor, pos, index, g_cost, cost, n_cost);
			}
			if (look(pos.translate(-dx, 0)) != cost) {
				jump_neighbor(pos.translate(-dx, dy), pos, index, g_cost, cost, look(pos.translate(-dx, dy)));
			}
			if (look(pos.translate(0, -dy)) != cost) {
				jump_neighbor(pos.translate(dx, -dy), pos, index, g_cost, cost, look(pos.translate(dx, -dy)));
			}
		} else { // Jumping left / right
			if (border_dy == 1 || look(pos.translate(0, 1)) != cost) {
				jump_neighbor(pos.translate(dx, 1), pos, index, g_cost, cost, look(pos.translate(dx, 1)));
			}
			if (border_dy == -1 || look(pos.translate(0, -1)) != cost) {
				jump_neighbor(pos.translate(dx, -1), pos, index, g_cost, cost, look(pos.translate(dx, -1)));
			}
		}
	} else { // Jumping up / down
		if (border_dx == 1 || look(pos.translate(1, 0)) != cost) {
			jump_neighbor(pos.translate(1, dy), pos, index, g_cost, cost, look(pos.translate(1, dy)));
		}
		if (border_dx == -1 || look(pos.translate(-1, 0)) != cost) {
			jump_neighbor(pos.translate(-1, dy), pos, index, g_cost, cost, look(pos.translate(-1, dy)));
		}
	}
}

auto path_finder_t::jump_neighbor(indexed_position_t neighbor, const indexed_position_t pos, const pos_index_t index, cost_t g_cost, cost_t cost, cost_t n_cost) -> void {
	assert(pos_index_t{pos} == index);
	if (n_cost != cost || is_border_coord(neighbor.xx) || is_border_coord(neighbor.yy)) {
		if (n_cost == obstacle) {
			return;
		}
		g_cost += n_cost;
	} else {
		neighbor = jump(neighbor, neighbor.xx - pos.xx, neighbor.yy - pos.yy, n_cost);
		if (neighbor == indexed_position_t{}) {
			return;
		}
		g_cost += (n_cost * (pos.range_to(neighbor) - 1)) + look(neighbor);
	}

	push_node(neighbor, index, g_cost);
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
	auto min_node = indexed_position_t{};

	// Special case for searching to same node, otherwise it searches everywhere because origin node
	// is closed
	if (heuristic_(origin) == 0) {
		return result{
			.path = std::ranges::subrange{
				path_iterator{*this, pos_index_t{std::numeric_limits<pos_index_t>::max()}},
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
		if (room_index_from_location(origin.room()) == room_index_sentinel) {
			// Initial room is inaccessible
			_is_in_use = false;
			return result{
				.path = std::ranges::subrange{
					path_iterator{*this, pos_index_t{std::numeric_limits<pos_index_t>::max()}},
					sentinel_path_iterator{},
				},
				.cost = 0,
				.ops = 0,
				.incomplete = true,
			};
		}

		// Initial A* iteration
		min_node = index_from_pos(origin);
		auto index = pos_index_t{min_node};
		open_closed.close(*index);
		parents[ *index ] = pos_index_t{std::numeric_limits<pos_index_t>::max()};
		astar(min_node, index, 0);

		// Loop until we have a solution
		while (!heap.empty() && ops_remaining > 0) {

			// Pull cheapest open node off the heap and close the node
			auto current = pos_index_t{heap.top()};
			auto score = heap.key_proj()(*current);
			heap.pop();
			open_closed.close(*current);

			// Calculate costs
			auto pos = indexed_position_t{room_table_, current};
			cost_t h_cost = heuristic_(pos);
			cost_t g_cost = score - cost_t(h_cost * heuristic_weight);
			// std::print("\n* {}: h({}) + g({}) = f({})\n", pos, h_cost, g_cost, score);

			// Reached destination?
			if (h_cost == 0) {
				min_node = pos;
				min_node_h_cost = 0;
				min_node_g_cost = g_cost;
				break;
			} else if (h_cost < min_node_h_cost) {
				min_node = pos;
				min_node_h_cost = h_cost;
				min_node_g_cost = g_cost;
			}
			if (static_cast<unsigned>(g_cost + h_cost) > options.max_cost) {
				break;
			}

			// Add next neighbors to heap
			jps(pos, current, g_cost);
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
			path_iterator{*this, pos_index_t{min_node}},
			sentinel_path_iterator{},
		},
		.cost = min_node_g_cost,
		.ops = static_cast<int>(options.max_ops - ops_remaining),
		.incomplete = min_node_h_cost != 0,
	};
}

// Loads static terrain data into module upfront
std::mutex terrain_lock;
auto path_finder_t::load_terrain(v8::Local<v8::Object> world) -> void {
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
