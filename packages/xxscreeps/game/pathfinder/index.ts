import type { RoomPosition } from 'xxscreeps/game/position.js';

import { search } from 'xxscreeps/driver/pathfinder/pathfinder.js';
import { Game, me } from 'xxscreeps/game/index.js';
import { registerGlobal } from 'xxscreeps/game/symbols.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { CostMatrix } from './cost-matrix.js';
import { makeObstacleChecker } from './obstacle.js';

export { registerObstacleChecker } from './obstacle.js';
export { CostMatrix, search };

/**
 * A goal for a `PathFinder.search` operation. A goal is either a `RoomPosition` or an object with
 * `pos` and `range` properties.
 *
 * ***Important:*** Please note that if your goal is not walkable (for instance, a source) then you
 * should set `range` to at least 1 or else you will waste many CPU cycles searching for a target
 * that you can't walk on.
 * @public
 * @see https://docs.screeps.com/api/#PathFinder.search
 */
export type Goal = RoomPosition | GoalWithRange;
interface GoalWithRange {
	/**
	 * The target.
	 * @public
	 */
	pos: RoomPosition;

	/**
	 * Range to `pos` before goal is considered reached.
	 * @public
	 * @default 0
	 */
	range: number;

	/** @public */
	roomName?: undefined;
	/** @public */
	x?: undefined;
	/** @public */
	y?: undefined;
}

interface CommonSearchOptions {
	/**
	 * Cost for walking on plain positions.
	 * @public
	 * @default 1
	 */
	plainCost?: number | undefined;

	/**
	 * Cost for walking on swamp positions.
	 * @public
	 * @default 5
	 */
	swampCost?: number | undefined;

	/**
	 * The maximum allowed pathfinding operations. You can limit CPU time used for the search based on
	 * ratio 1 op ~ 0.001 CPU.
	 * @public
	 * @default 2000
	 */
	maxOps?: number | undefined;

	/**
	 * The maximum allowed rooms to search. The maximum is 64.
	 * @public
	 * @default 16
	 */
	maxRooms?: number | undefined;

	/**
	 * Weight to apply to the heuristic in the A* formula `F = G + weight * H`. Use this option only
	 * if you understand the underlying A* algorithm mechanics!
	 * @public
	 * @default 1.2
	 */
	heuristicWeight?: number | undefined;
}

/**
 * An object containing additional pathfinding flags, passed as the `opts` argument to
 * `PathFinder.search`.
 * @public
 * @see https://docs.screeps.com/api/#PathFinder.search
 */
export interface SearchOptions extends CommonSearchOptions {
	/**
	 * Request from the pathfinder to generate a
	 * [`CostMatrix`](https://docs.screeps.com/api/#PathFinder-CostMatrix) for a certain room. The
	 * callback accepts one argument, `roomName`. This callback will only be called once per room per
	 * search. If you are running multiple pathfinding operations in a single room and in a single
	 * tick you may consider caching your CostMatrix to speed up your code. Please read the CostMatrix
	 * documentation for more information on CostMatrix. If you return `false` from the callback the
	 * requested room will not be searched, and it won't count against `maxRooms`
	 * @public
	 */
	roomCallback?: ((roomName: string) => CostMatrix | false | undefined) | undefined;

	/**
	 * Instead of searching for a path *to* the goals this will search for a path *away* from the
	 * goals. The cheapest path that is out of `range` of every goal will be returned.
	 * @public
	 * @default false
	 */
	flee?: boolean;

	/**
	 * The maximum allowed cost of the path returned. If at any point the pathfinder detects that it
	 * is impossible to find a path with a cost less than or equal to `maxCost` it will immediately
	 * halt the search.
	 * @public
	 * @default Infinity
	 */
	maxCost?: number;
}

export interface RoomSearchOptions extends CommonSearchOptions {
	/**
	 * You can use this callback to modify a
	 * [`CostMatrix`](https://docs.screeps.com/api/#PathFinder-CostMatrix) for any room during the
	 * search. The callback accepts two arguments, `roomName` and `costMatrix`. Use the `costMatrix`
	 * instance to make changes to the positions costs. If you return a new matrix from this callback,
	 * it will be used instead of the built-in cached one.
	 * @public
	 */
	costCallback?: (roomName: string, costMatrix: CostMatrix) => CostMatrix | undefined;
	/**
	 * Treat squares with creeps as walkable. Can be useful with too many moving creeps around or in
	 * some other cases. The default value is false.
	 * @public
	 * @default false
	 */
	ignoreCreeps?: boolean;

	/**
	 * Treat squares with destructible structures (constructed walls, ramparts, spawns, extensions) as
	 * walkable.
	 * @public
	 * @default false
	 */
	ignoreDestructibleStructures?: boolean;

	/**
	 * Ignore road structures. Enabling this option can speed up the search.
	 * @public
	 * @default false
	 */
	ignoreRoads?: boolean;

	/**
	 * Find a path to a position in specified linear range of target.
	 * @public
	 * @default 0
	 */
	range?: number;
}

const cachedCostMatrices = new Map<string, CostMatrix | undefined>();

export function flush() {
	cachedCostMatrices.clear();
}

export function roomSearch(origin: RoomPosition, goals: RoomPosition[], options: RoomSearchOptions) {
	// Convert room search options to PathFinder options
	const { costCallback, ignoreCreeps, ignoreDestructibleStructures, ignoreRoads } = options;
	const costMatrixKey =
		(ignoreCreeps ? 'a' : '') +
		(ignoreDestructibleStructures ? 'b' : '') +
		(ignoreRoads ? 'c' : '');
	const baseCost = ignoreRoads ? 1 : 2;
	const internalOptions: SearchOptions = {
		heuristicWeight: options.heuristicWeight,
		maxOps: options.maxOps,
		maxRooms: options.maxRooms,
		plainCost: options.plainCost ?? baseCost,
		swampCost: options.swampCost ?? baseCost * 5,

		roomCallback(roomName) {
			// Get cost matrix for this room
			const costMatrix = getOrSet(cachedCostMatrices, `${roomName}:${costMatrixKey}`, () => {
				// Return early if there's no access to this room
				const room = Game.rooms[roomName];
				if (!room) {
					return;
				}
				const costMatrix = new CostMatrix();

				// Mark obstacles
				const check = makeObstacleChecker({
					ignoreCreeps,
					ignoreDestructibleStructures,
					room,
					user: me,
				});
				for (const object of room['#objects']) {
					const { x, y } = object.pos;
					if (check(object)) {
						costMatrix.set(x, y, 0xff);
					} else if (!ignoreRoads) {
						const currentCost = costMatrix.get(x, y);
						if (currentCost !== 0xff) {
							const cost = object['#pathCost'];
							if (cost !== undefined && (currentCost === 0 || cost < currentCost)) {
								costMatrix.set(x, y, cost);
							}
						}
					}
				}
				return costMatrix;
			});

			// Allow user to augment the cost matrix
			if (costCallback) {
				const clonedMatrix = costMatrix?.clone() ?? new CostMatrix();
				const nextMatrix = costCallback(roomName, clonedMatrix) ?? clonedMatrix;
				if (nextMatrix instanceof CostMatrix) {
					return nextMatrix;
				}
			}
			return costMatrix;
		},
	};

	// Make goals
	const range = Math.max(1, options.range ?? 1);
	const goalsWithRange = (Array.isArray(goals) ? goals : [ goals ]).map(
		pos => ({ pos, range }));

	// Invoke the big boy pathfinder
	const result = search(origin, goalsWithRange, internalOptions);

	return result;
}

/**
 * Specify whether to use this new experimental pathfinder in game objects methods. This method
 * should be invoked every tick. It affects the following methods behavior:
 * [`Room.findPath`](https://docs.screeps.com/api/#Room.findPath),
 * [`RoomPosition.findPathTo`](https://docs.screeps.com/api/#RoomPosition.findPathTo),
 * [`RoomPosition.findClosestByPath`](https://docs.screeps.com/api/#RoomPosition.findClosestByPath),
 * [`Creep.moveTo`](https://docs.screeps.com/api/#Creep.moveTo).
 * @public
 * @deprecated
 * @see https://docs.screeps.com/api/#PathFinder.use
 */
function use() {}

/**
 * Contains powerful methods for pathfinding in the game world. This module is written in fast
 * native C++ code and supports custom navigation costs and paths which span multiple rooms.
 * @public
 * @see https://docs.screeps.com/api/#PathFinder
 */
const PathFinder = {
	CostMatrix,
	use,

	/**
	 * Find an optimal path between `origin` and `goal`.
	 * @param origin The start position.
	 * @param goal A goal or an array of goals. If more than one goal is supplied then the cheapest
	 * path found out of all the goals will be returned. A goal is either a `RoomPosition` or an
	 * object with `pos` and `range` properties.
	 *
	 * ***Important:*** Please note that if your goal is not walkable (for instance, a source) then
	 * you should set `range` to at least 1 or else you will waste many CPU cycles searching for a
	 * target that you can't walk on.
	 * @param options A {@link SearchOptions} object containing additional pathfinding flags.
	 * @public
	 * @see https://docs.screeps.com/api/#PathFinder.search
	 */
	search,
};
registerGlobal('PathFinder', PathFinder);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { PathFinder: typeof PathFinder }
}
