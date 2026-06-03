module;
#include <cassert>
module screeps;

using namespace screeps;

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
		(..., [ & ](world_position_t neighbor) -> void {
			auto [ room_index, n_cost ] = look_open(neighbor);
			if (n_cost != obstacle) {
				push_node({room_index, neighbor}, index, g_cost + n_cost);
			}
		}(neighbors));
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
