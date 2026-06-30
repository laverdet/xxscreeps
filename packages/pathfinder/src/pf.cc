module;
#include <cassert>
export module screeps;
export import :jps;
export import :pf;
import std;

namespace screeps {

// Per-process terrain data
terrain_map_type terrain_map;

// Loads static terrain data into module upfront
std::mutex terrain_lock;
auto load_terrain(const world_type& world) -> void {
	std::lock_guard<std::mutex> lock{terrain_lock};
	// Parse out terrain by rooms
	for (const auto& entry : world) {
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
		terrain_map[ std::bit_cast<std::uint16_t>(entry.room) ] = entry.terrain.data();
	}
}

// Return room index from a map position, allocates a new room index if needed and possible
template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::room_index_from_location(room_location_t location) -> room_index_t {
	auto room_index = room_table_.find(location);
	if (room_index == room_scope_table::sentinel) {
		if (room_table_.size() >= max_rooms_ || blocked_rooms_.contains(location)) {
			return room_index_sentinel;
		}
		auto room_id = std::bit_cast<std::uint16_t>(location);
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
		const auto* terrain_ptr = terrain_map[ room_id ];
		if (terrain_ptr == nullptr) {
			blocked_rooms_.insert(location);
			return room_index_sentinel;
		}
		auto callback_result = room_callback_(location);
		if (std::holds_alternative<bool>(callback_result) && !std::get<bool>(callback_result)) {
			blocked_rooms_.insert(location);
			return room_index_sentinel;
		}
		constexpr auto unwrap = util::overloaded{
			[](auto /* undefined_or_true */) -> cost_matrix_type { return nullptr; },
			[](std::span<const std::uint8_t> data) -> cost_matrix_type {
				return data.size() == 2'500 ? reinterpret_cast<cost_matrix_type>(data.data()) : nullptr;
			},
		};
		auto terrain = room_terrain{terrain_ptr, std::visit(unwrap, callback_result)};
		return room_index_t{room_table_.insert(std::pair{location, terrain})};
	} else {
		return room_index_t{room_index};
	}
}

// Conversions to/from index & world_position_t
template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::index_from_pos(world_position_t pos) const -> indexed_position_t {
	auto room_index = room_index_t{room_table_.find(pos.room())};
	if (room_index == room_index_sentinel) {
		throw std::runtime_error("Invalid invocation of index_from_pos");
	}
	return indexed_position_t{room_index, pos};
}

// Push a new node to the heap, or update its cost if it already exists
template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::push_node(indexed_position_t node, pos_index_t parent_index, cost_t g_cost) -> void {
	auto index = pos_index_t{node};
	if (open_closed_.is_closed(*index)) {
		return;
	}
	auto h_cost = static_cast<cost_t>(heuristic_(node) * heuristic_weight_);
	auto f_cost = h_cost + g_cost;

	if (open_closed_.is_open(*index)) {
		if (heap_.key_proj()(*index) > f_cost) {
			heap_.update(*index, [ & ](auto& score) { return score[ *index ] = f_cost; });
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
			parents_[ *index ] = parent_index;
			// std::print("~ {}: h({}) + g({}) = f({})\n", node, h_cost, g_cost, f_cost);
		}
	} else {
		heap_.push(*index, [ & ](auto& score) { return score[ *index ] = f_cost; });
		open_closed_.open(*index);
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
		parents_[ *index ] = parent_index;
		// std::print("+ {}: h({}) + g({}) = f({})\n", node, h_cost, g_cost, f_cost);
	}
}

// Return cost of moving to a node
template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::look(indexed_position_t pos) const -> cost_t {
	return room_table_[ *pos.room_index - 1 ].second(look_table_, pos.xx % 50, pos.yy % 50);
}

// Look, and also potentially open up a new room
template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::look_open(world_position_t pos) -> std::pair<room_index_t, cost_t> {
	room_index_t room_index = room_index_from_location(pos.room());
	if (room_index == room_index_sentinel) {
		return {room_index_sentinel, obstacle};
	}
	auto cost = room_table_[ *room_index - 1 ].second(look_table_, pos.xx % 50, pos.yy % 50);
	return {room_index, cost};
}

template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::heuristic(indexed_position_t pos) const -> cost_t {
	return heuristic_(pos);
}

template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::heuristic(world_position_t pos) const -> cost_t {
	// NOLINTNEXTLINE(cppcoreguidelines-slicing)
	return heuristic_(pos);
}

// Perform the search~
template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::search(Callback room_callback, world_position_t origin, goals_type goals, const options& options) -> std::optional<result> {

	// Clean up from previous iteration
	room_table_.clear();
	blocked_rooms_.clear();
	open_closed_.clear();
	heap_.clear();

	// Other initialization
	room_callback_ = std::move(room_callback);
	auto reset_room_callback = util::scope_exit{[ & ] { room_callback_ = {}; }};
	heuristic_.reset(std::move(goals), options.flee);
	look_table_[ 0 ] = std::clamp(options.plain_cost, 1, 0xfe);
	look_table_[ 2 ] = std::clamp(options.swamp_cost, 1, 0xfe);
	max_rooms_ = std::clamp(options.max_rooms, 1, static_cast<int>(RoomCapacity));
	heuristic_weight_ = std::clamp(options.heuristic_weight, 1., 9.);

	// State
	auto max_cost = std::clamp(options.max_cost, 1, std::numeric_limits<cost_t>::max());
	auto ops_remaining = std::clamp(options.max_ops, 1, std::numeric_limits<int>::max());
	auto min_node_h_cost = std::numeric_limits<cost_t>::max();
	auto min_node_g_cost = std::numeric_limits<cost_t>::max();
	auto min_node = indexed_position_t{};

	// Special case for searching to same node, otherwise it searches everywhere because origin node
	// is closed
	if (heuristic(origin) == 0) {
		return result{
			.path = std::ranges::subrange{
				path_iterator{room_table_, parents_, sentinel_pos_index},
				sentinel_path_iterator{},
			},
			.cost = 0,
			.ops = 0,
			.incomplete = false,
		};
	}

	// Prime data for `index_from_pos`
	if (room_index_from_location(origin.room()) == room_index_sentinel) {
		// Initial room is inaccessible
		return result{
			.path = std::ranges::subrange{
				path_iterator{room_table_, parents_, sentinel_pos_index},
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
	open_closed_.close(*index);
	// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
	parents_[ *index ] = pos_index_t{std::numeric_limits<pos_index_t>::max()};
	astar(min_node, index, 0);

	// Loop until we have a solution
	while (!heap_.empty() && ops_remaining > 0) {

		// Pull cheapest open node off the heap and close the node
		auto current = pos_index_t{heap_.top()};
		auto score = heap_.key_proj()(*current);
		heap_.pop();
		open_closed_.close(*current);

		// Calculate costs
		auto pos = indexed_position_t{room_table_, current};
		cost_t h_cost = heuristic(pos);
		cost_t g_cost = score - static_cast<int>(h_cost * heuristic_weight_);
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
		if (g_cost + h_cost > max_cost) {
			break;
		}

		// Add next neighbors to heap
		if (options.heuristic_weight == 1) {
			// jps can sometimes produce suboptimal paths with non-uniform cost grids even with the added
			// forced neighbor heuristic. so, for heuristicWeight == 1 we will use astar for the best
			// paths.
			astar(pos, current, g_cost);
		} else {
			jps(pos, current, g_cost);
		}
		--ops_remaining;

		// Check termination
		Check();
	}

	// Reconstruct path from A* graph
	return result{
		.path = std::ranges::subrange{
			path_iterator{room_table_, parents_, pos_index_t{min_node}},
			sentinel_path_iterator{},
		},
		.cost = min_node_g_cost,
		.ops = options.max_ops - ops_remaining,
		.incomplete = min_node_h_cost != 0,
	};
}

}; // namespace screeps
