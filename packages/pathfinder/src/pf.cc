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
		auto room_id = std::bit_cast<std::uint16_t>(location);
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
		terrain_type terrain_ptr = terrain_map[ room_id ];
		if (terrain_ptr == nullptr) {
			blocked_rooms.insert(location);
			return room_index_sentinel;
		}
		cost_matrix_type cost_matrix = nullptr;
		if (!room_callback_.IsEmpty()) {
			Nan::TryCatch try_catch;
			v8::Local<v8::Value> argv[ 1 ];
			argv[ 0 ] = Nan::New(room_id);
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
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
			parents[ *index ] = parent_index;
			// std::print("~ {}: h({}) + g({}) = f({})\n", node, h_cost, g_cost, f_cost);
		}
	} else {
		heap.push(*index, [ & ](auto& score) { return score[ *index ] = f_cost; });
		open_closed.open(*index);
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
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
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
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
			cost_t g_cost = score - static_cast<int>(h_cost * heuristic_weight);
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
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
		terrain_map[ id ] = *Nan::TypedArrayContents<uint8_t>(terrain);
	}
}
