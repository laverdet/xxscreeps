import type { Direction, RoomPosition } from 'xxscreeps/game/position.js';
import type { Terrain } from 'xxscreeps/game/terrain.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { getOffsetsFromDirection } from 'xxscreeps/game/direction.js';
import { Game } from 'xxscreeps/game/index.js';
import * as PathFinder from 'xxscreeps/game/pathfinder/index.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { Room } from './room.js';

export type FindPathOptions = PathFinder.RoomSearchOptions & {
	serialize?: boolean;
};

export type RoomPath = {
	x: number;
	y: number;
	dx: -1 | 0 | 1;
	dy: -1 | 0 | 1;
	direction: Direction;
}[];

declare module './room.js' {

	namespace Room {
		/**
		 * Serialize a path array into a short string representation, which is suitable to store in
		 * memory.
		 * @param path A path array retrieved from
		 * [`Room.findPath`](https://docs.screeps.com/api/#Room.findPath).
		 * @returns A serialized string form of the given path.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.serializePath
		 */
		const serializePath: (path: RoomPath) => string;

		/**
		 * Deserialize a short string path representation into an array form.
		 * @param path A serialized path string.
		 * @returns A path array.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.deserializePath
		 */
		const deserializePath: (path: string) => RoomPath;
	}

	interface Room {
		/**
		 * Find the exit direction en route to another room. Please note that this method is not
		 * required for inter-room movement, you can simply pass the target in another room into
		 * [`Creep.moveTo`](https://docs.screeps.com/api/#Creep.moveTo) method.
		 * @param room Another room name or room object.
		 * @returns The room direction constant, one of the following: `FIND_EXIT_TOP`,
		 * `FIND_EXIT_RIGHT`, `FIND_EXIT_BOTTOM`, `FIND_EXIT_LEFT`. Or one of the following error codes:
		 * `ERR_NO_PATH`, `ERR_INVALID_ARGS`
		 * @public
		 * @see https://docs.screeps.com/api/#Room.findExitTo
		 */
		findExitTo: (room: Room | string) => any;

		/**
		 * Get a [`Room.Terrain`](https://docs.screeps.com/api/#Room-Terrain) object which provides fast
		 * access to static terrain data. This method works for any room in the world even if you have
		 * no access to it.
		 * @returns Returns new [`Room.Terrain`](https://docs.screeps.com/api/#Room-Terrain) object.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.getTerrain
		 */
		getTerrain: () => Terrain;

		/**
		 * Find an optimal path inside the room between fromPos and toPos using [Jump Point Search
		 * algorithm](http://en.wikipedia.org/wiki/Jump_point_search).
		 * @param origin The start position.
		 * @param goal The end position.
		 * @param options An object containing additional pathfinding flags:
		 * - `ignoreCreeps` - Treat squares with creeps as walkable. Can be useful with too many moving
		 *   creeps around or in some other cases. The default value is false.
		 * - `ignoreDestructibleStructures` - Treat squares with destructible structures (constructed
		 *   walls, ramparts, spawns, extensions) as walkable. The default value is false.
		 * - `ignoreRoads` - Ignore road structures. Enabling this option can speed up the search. The
		 *   default value is false.
		 * - `costCallback` - You can use this callback to modify a
		 *   [`CostMatrix`](https://docs.screeps.com/api/#PathFinder-CostMatrix) for any room during the
		 *   search. The callback accepts two arguments, `roomName` and `costMatrix`. Use the
		 *   `costMatrix` instance to make changes to the positions costs. If you return a new matrix
		 *   from this callback, it will be used instead of the built-in cached one.
		 * - `maxOps` - The maximum limit of possible pathfinding operations. You can limit CPU time
		 *   used for the search based on ratio 1 op ~ 0.001 CPU. The default value is 2000.
		 * - `heuristicWeight` - Weight to apply to the heuristic in the A* formula
		 *   `F = G + weight * H`. Use this option only if you understand the underlying A* algorithm
		 *   mechanics! The default value is 1.2.
		 * - `serialize` - If true, the result path will be serialized using
		 *   [`Room.serializePath`](https://docs.screeps.com/api/#Room.serializePath). The default is
		 *   false.
		 * - `maxRooms` - The maximum allowed rooms to search. The default (and maximum) is 16.
		 * - `range` - Find a path to a position in specified linear range of target. The default is 0.
		 * - `plainCost` - Cost for walking on plain positions. The default is 1.
		 * - `swampCost` - Cost for walking on swamp positions. The default is 5.
		 * @returns An array with path steps in the following format:
		 * `[ { x: 10, y: 5, dx: 1, dy: 0, direction: RIGHT }, ... ]`
		 * @public
		 * @see https://docs.screeps.com/api/#Room.findPath
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize?: false }): RoomPath;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize: true }): string;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize?: boolean }): RoomPath | string;
	}
}

Object.assign(Room, {
	serializePath(path: RoomPath) {
		if (!Array.isArray(path)) {
			throw new Error('`path` is not an array');
		}
		const [ origin ] = path;
		if (origin === undefined) {
			return '';
		}
		if (origin.x < 0 || origin.y < 0) {
			throw new Error('path coordinates cannot be negative');
		}
		let result = `${origin.x}`.padStart(2, '0') + `${origin.y}`.padStart(2, '0');
		for (const step of path) {
			result += step.direction;
		}
		return result;
	},

	deserializePath(path: string) {
		if (typeof path !== 'string') {
			throw new Error('`path` is not a string');
		}
		const result: RoomPath = [];
		if (path.length === 0) {
			return result;
		}

		let xx = Number(path.substr(0, 2));
		let yy = Number(path.substr(2, 2));
		if (Number.isNaN(xx) || Number.isNaN(yy)) {
			throw new Error('`path` is not a valid serialized path string');
		}
		for (let ii = 4; ii < path.length; ++ii) {
			const direction = Number(path[ii]) as Direction;
			const { dx, dy } = getOffsetsFromDirection(direction);
			if (ii > 4) {
				xx += dx;
				yy += dy;
			}
			result.push({
				x: xx,
				y: yy,
				dx, dy,
				direction,
			});
		}
		return result;
	},
});

extend(Room, {
	findExitTo(room: Room | string) {
		const route = Game.map.findRoute(this, room);
		if (typeof route === 'number') {
			return route;
		} else {
			return route[0]?.exit ?? C.ERR_NO_PATH;
		}
	},

	findPath(origin: RoomPosition, goal: RoomPosition, options: FindPathOptions & { serialize?: boolean } = {}) {

		if (origin.isEqualTo(goal)) {
			return options.serialize ? '' : [];
		}

		// Delegate to `PathFinder` for main search
		const result = PathFinder.roomSearch(origin, [ goal ], options);

		// Add last position for automatic {range:1} paths
		if (
			(options.range ?? 0) === 0 &&
			(result.path.length
				? result.path.at(-1)?.getRangeTo(goal) === 1 :
				origin.isNearTo(goal))
		) {
			result.path.push(goal);
		}

		// Convert to room path
		const path: RoomPath = [];
		let previous = origin;
		for (const pos of result.path) {
			if (pos.roomName !== this.name) {
				break;
			}
			path.push({
				x: pos.x,
				y: pos.y,
				dx: pos.x - previous.x as -1 | 0 | 1,
				dy: pos.y - previous.y as -1 | 0 | 1,
				direction: previous.getDirectionTo(pos),
			});
			previous = pos;
		}
		if (options.serialize) {
			return Room.serializePath(path);
		}
		return path;
	},

	getTerrain() {
		return Game.map.getRoomTerrain(this.name);
	},
});
