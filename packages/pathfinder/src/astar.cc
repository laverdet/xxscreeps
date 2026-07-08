module;
#include <cassert>
export module screeps:astar;
import :pf;
namespace screeps {

// Run an iteration of basic A*
auto astar = []<astar_pathfinder Type>(Type pf, const indexed_position_t pos, const pos_index_t index, cost_t g_cost) -> void {
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
		auto [ room_index, n_cost ] = pf.look_open(neighbor);
		if (n_cost == obstacle) {
			// std::print("# {}\n", neighbor);
			continue;
		}
		pf.push_node({room_index, neighbor}, index, g_cost + n_cost);
	}
};

} // namespace screeps
