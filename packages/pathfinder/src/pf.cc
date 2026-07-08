module;
#include <cassert>
export module screeps;
export import :astar;
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

// Combine multiple delegates into one which can be used by the implementations
template <class... Types>
struct composite_delegate : public Types... {
		explicit composite_delegate(Types... args) : Types{std::move(args)}... {}
};

// Look, and also potentially open up a new room
template <class Callback, class RoomTable>
[[nodiscard]] auto look_delegate<Callback, RoomTable>::look(indexed_position_t pos) const -> cost_t {
	return room_table.get()[ *pos.room_index - 1 ].second(look_table, pos.xx % 50, pos.yy % 50);
}

// Return cost of moving to a node
template <class Callback, class RoomTable>
auto look_delegate<Callback, RoomTable>::look_open(world_position_t pos) -> std::pair<room_index_t, cost_t> {
	room_index_t room_index = room_index_from_location(pos.room());
	if (room_index == room_index_sentinel) {
		return {room_index_sentinel, obstacle};
	}
	auto cost = room_table.get()[ *room_index - 1 ].second(look_table, pos.xx % 50, pos.yy % 50);
	return {room_index, cost};
}

// Return room index from a map position, allocates a new room index if needed and possible
template <class Callback, class RoomTable>
auto look_delegate<Callback, RoomTable>::room_index_from_location(room_location_t location) -> room_index_t {
	auto& room_table = this->room_table.get();
	auto room_index = room_table.find(location);
	if (room_index == RoomTable::sentinel) {
		auto& blocked_rooms = this->blocked_rooms.get();
		if (room_table.size() >= max_rooms || blocked_rooms.contains(location)) {
			return room_index_sentinel;
		}
		auto room_id = std::bit_cast<std::uint16_t>(location);
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
		const auto* terrain_ptr = terrain_map[ room_id ];
		if (terrain_ptr == nullptr) {
			blocked_rooms.insert(location);
			return room_index_sentinel;
		}
		auto callback_result = room_callback(location);
		if (std::holds_alternative<bool>(callback_result) && !std::get<bool>(callback_result)) {
			blocked_rooms.insert(location);
			return room_index_sentinel;
		}
		constexpr auto unwrap = util::overloaded{
			[](auto /* undefined_or_true */) -> cost_matrix_type { return nullptr; },
			[](std::span<const std::uint8_t> data) -> cost_matrix_type {
				return data.size() == 2'500 ? reinterpret_cast<cost_matrix_type>(data.data()) : nullptr;
			},
		};
		auto terrain = room_terrain{terrain_ptr, std::visit(unwrap, callback_result)};
		return room_index_t{room_table.insert(std::pair{location, terrain})};
	} else {
		return room_index_t{room_index};
	}
}

// Conversions to/from index & world_position_t
template <class Callback, class RoomTable>
[[nodiscard]] auto look_delegate<Callback, RoomTable>::index_from_pos(world_position_t pos) const -> indexed_position_t {
	auto room_index = room_index_t{room_table.get().find(pos.room())};
	if (room_index == room_index_sentinel) {
		throw std::runtime_error("Invalid invocation of index_from_pos");
	}
	return indexed_position_t{room_index, pos};
}

// Return the indexed parent of the given node
template <class Heap>
auto node_delegate<Heap>::parent_of(this auto& self, pos_index_t index) -> indexed_position_t {
	// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
	return indexed_position_t{self.room_table.get(), self.parents[ *index ]};
}

// Push a new node to the heap, or update its cost if it already exists
template <class Heap>
auto node_delegate<Heap>::push_node(indexed_position_t node, pos_index_t parent_index, cost_t g_cost) -> void {
	auto index = pos_index_t{node};
	if (open_closed.is_closed(*index)) {
		return;
	}
	auto h_cost = static_cast<cost_t>(heuristic(node) * heuristic_weight);
	auto f_cost = h_cost + g_cost;

	if (open_closed.is_open(*index)) {
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
		if (scores[ *index ] > f_cost) {
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
			scores[ *index ] = f_cost;
			heap.get().push({index, f_cost});
			// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
			parents[ *index ] = parent_index;
			// std::print("~ {}: h({}) + g({}) = f({})\n", node, h_cost, g_cost, f_cost);
		}
	} else {
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
		scores[ *index ] = f_cost;
		heap.get().push({index, f_cost});
		open_closed.open(*index);
		// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
		parents[ *index ] = parent_index;
		// std::print("+ {}: h({}) + g({}) = f({})\n", node, h_cost, g_cost, f_cost);
	}
}

// Perform the search~
template <auto Check, class Callback, std::size_t RoomCapacity>
auto pathfinder<Check, Callback, RoomCapacity>::search(
	Callback room_callback,
	world_position_t origin,
	heuristic_t heuristic,
	const options& options
) -> std::optional<result> {

	// Special case for searching to same node, otherwise it searches everywhere because origin node
	// is closed
	constexpr auto empty_path = std::ranges::subrange{path_iterator{sentinel_path_iterator{}}, sentinel_path_iterator{}};
	if (heuristic(origin) == 0) {
		return result{.path = empty_path};
	}

	// Clean up from previous iteration
	instance_state_.heap.clear();
	instance_state_.room_table.clear();

	// Algorithm delegate
	auto blocked_rooms = blocked_rooms_type{};
	auto max_cost = std::clamp(options.max_cost, 1, std::numeric_limits<cost_t>::max());
	auto delegate = composite_delegate{
		node_delegate{
			.heuristic = std::move(heuristic),
			.heuristic_weight = std::clamp(options.heuristic_weight, 1., 9.),
			.open_closed = instance_state_.open_closed.clear_and_make_view(),
			.scores = instance_state_.scores.data(),
			.parents = instance_state_.parents.data(),
			.heap = std::ref(instance_state_.heap),
		},
		look_delegate{
			.max_rooms = static_cast<unsigned>(std::clamp(options.max_rooms, 1, static_cast<int>(RoomCapacity))),
			.look_table = {{std::clamp(options.plain_cost, 1, 0xfe), obstacle, std::clamp(options.swamp_cost, 1, 0xfe), obstacle}},
			.room_callback = std::move(room_callback),
			.blocked_rooms = std::ref(blocked_rooms),
			.room_table = std::ref(instance_state_.room_table),
		}
	};

	// Prime data for `index_from_pos`
	if (delegate.room_index_from_location(origin.room()) == room_index_sentinel) {
		// Initial room is inaccessible
		return result{
			.path = empty_path,
			.incomplete = true,
		};
	}

	// Local state
	auto* parents = delegate.parents;
	auto* scores = delegate.scores;
	auto& room_table = delegate.room_table.get();
	auto ops_remaining = std::clamp(options.max_ops, 1, std::numeric_limits<int>::max());
	auto min_node_g_cost = 0;
	auto min_node_h_cost = std::numeric_limits<cost_t>::max();

	// Initial A* iteration
	auto min_node = delegate.index_from_pos(origin);
	auto index = pos_index_t{min_node};
	delegate.open_closed.close(*index);
	// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
	parents[ *index ] = sentinel_pos_index;
	// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-pointer-arithmetic)
	scores[ *index ] = static_cast<cost_t>(heuristic(origin) * delegate.heuristic_weight); // g_cost == 0
	astar(delegate, min_node, index, 0);

	// Generic iteration step used for forward/reverse and astar/jps expansions
	constexpr auto make_iterate = [](auto& delegate, auto& min_node, auto& min_node_h_cost, auto& min_node_g_cost, auto max_cost) -> auto {
		auto open_closed = delegate.open_closed;
		auto* scores = delegate.scores;
		auto& heap = delegate.heap.get();
		auto& room_table = delegate.room_table.get();
		return [ &, open_closed, scores, max_cost ](auto algorithm) mutable -> bool {
			while (!heap.empty()) {
				// Pull cheapest open node off the heap; discard stale entries
				auto [ current, score ] = heap.top();
				heap.pop();
				// NOLINTNEXTLINE(cppcoreguidelines-pro-bounds-constant-array-index)
				if (scores[ *current ] != score) {
					continue;
				}
				open_closed.close(*current);

				// Calculate costs
				auto pos = indexed_position_t{room_table, current};
				cost_t h_cost = delegate.heuristic(pos);
				cost_t g_cost = score - static_cast<int>(h_cost * delegate.heuristic_weight);
				// std::print("\n* {}: h({}) + g({}) = f({})\n", pos, h_cost, g_cost, score);

				if (h_cost == 0) {
					// Reached destination
					min_node = pos;
					min_node_h_cost = 0;
					min_node_g_cost = g_cost;
					break;
				} else if (h_cost < min_node_h_cost) {
					// Found better path
					min_node = pos;
					min_node_h_cost = h_cost;
					min_node_g_cost = g_cost;
				}
				if (g_cost + h_cost > max_cost) {
					// Exceeded cost budget
					break;
				}

				// Add next neighbors to heap
				algorithm(delegate, pos, current, g_cost);
				return true;
			}
			return false;
		};
	};

	// Loop until we have a solution
	try {
		auto iterate = make_iterate(delegate, min_node, min_node_h_cost, min_node_g_cost, max_cost);
		auto dispatch = [ &, iterate ](auto algorithm) mutable -> void {
			while (ops_remaining > 0 && iterate(algorithm)) {
				--ops_remaining;
				Check();
			}
		};
		if (delegate.heuristic_weight == 1) {
			// jps can sometimes produce suboptimal paths with non-uniform cost grids even with the added
			// forced neighbor heuristic. so, for heuristicWeight == 1 we will use astar for the best
			// paths.
			dispatch(astar);
		} else {
			dispatch(jps);
		}
		// NOLINTNEXTLINE(bugprone-empty-catch)
	} catch (const std::range_error&) {
		// This error is, probably, a heap overflow. In this case all we can do is return a partial path.
	}

	// Reconstruct path from A* graph
	return result{
		.path = std::ranges::subrange{
			path_iterator{room_table, parents, pos_index_t{min_node}},
			sentinel_path_iterator{},
		},
		.cost = min_node_g_cost,
		.ops = options.max_ops - ops_remaining,
		.incomplete = min_node_h_cost != 0,
	};
}

}; // namespace screeps
