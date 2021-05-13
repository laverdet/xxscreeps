import type { RoomPosition } from '../position';

import { Game, me } from 'xxscreeps/game';
import { CostMatrix } from './cost-matrix';
import { getOrSet } from 'xxscreeps/utility/utility';
import { makeObstacleChecker } from './obstacle';
import { registerGlobal } from '../symbols';
import { search } from 'xxscreeps/driver/path-finder';

export { registerObstacleChecker } from './obstacle';
export { CostMatrix, search };
export type Goal = RoomPosition | { pos: RoomPosition; range: number };

type CommonSearchOptions = {
	plainCost?: number;
	swampCost?: number;
	maxOps?: number;
	maxRooms?: number;
	heuristicWeight?: number;
};

export type SearchOptions = CommonSearchOptions & {
	roomCallback?: (roomName: string) => CostMatrix | false | undefined;
	flee?: boolean;
	maxCost?: number;
};

export type RoomSearchOptions = CommonSearchOptions & {
	costCallback?: (roomName: string, costMatrix: CostMatrix) => CostMatrix | undefined | void;
	ignoreCreeps?: boolean;
	ignoreDestructibleStructures?: boolean;
	ignoreRoads?: boolean;
	range?: number;
};

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
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (!room) {
					return;
				}
				const costMatrix = new CostMatrix;

				// Mark obstacles
				const check = makeObstacleChecker({
					ignoreCreeps,
					ignoreDestructibleStructures,
					isPathFinder: true,
					room,
					type: 'creep',
					user: me,
				});
				for (const object of room['#objects']) {
					const { x, y } = object.pos;
					if (check(object)) {
						costMatrix.set(x, y, 0xff);
					} else if (!ignoreRoads) {
						const cost = object['#pathCost'];
						if (cost !== undefined && cost < costMatrix.get(x, y)) {
							costMatrix.set(x, y, cost);
						}
					}
				}
				return costMatrix;
			});

			// Allow user to augment the cost matrix
			if (costCallback) {
				const clonedMatrix = costMatrix?.clone() ?? new CostMatrix;
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

	// Add last position for automatic {range:1} paths
	if (
		(options.range ?? 0) === 0 &&
		result.path.length > 0 && goals.length === 1 &&
		result.path[result.path.length - 1].getRangeTo(goals[0]) === 1
	) {
		result.path.push(goals[0]);
	}
	return result;
}

function use() {}

const PathFinder = { CostMatrix, use, search };
registerGlobal('PathFinder', PathFinder);
declare module 'xxscreeps/game/runtime' {
	interface Global { PathFinder: typeof PathFinder }
}
