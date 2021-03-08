import * as C from 'xxscreeps/game/constants';
import { search } from 'xxscreeps/driver/path-finder';
import { Variant } from 'xxscreeps/schema';
import { getOrSet, instantiate } from 'xxscreeps/util/utility';
import * as Game from './game';
import type { RoomPosition } from './position';
import type { Room } from './room';
import type { RoomObject } from './objects/room-object';
import { ConstructionSite } from 'xxscreeps/mods/construction/construction-site';
import { Creep } from './objects/creep';
import { Structure } from './objects/structures';
import { StructureRoad } from './objects/structures/road';
export type { SearchReturn } from 'xxscreeps/driver/path-finder';

export { search };

export const obstacleTypes = Object.freeze(new Set(C.OBSTACLE_OBJECT_TYPES));
const destructibleStructureTypes = Object.freeze(new Set(Object.keys(C.CONSTRUCTION_COST)));
const permanentObstacleTypes = Object.freeze(new Set(C.OBSTACLE_OBJECT_TYPES.filter(type =>
	type !== 'creep' && type !== 'powerCreep' && !destructibleStructureTypes.has(type))));

export class CostMatrix {
	_bits = new Uint8Array(2500);

	set(xx: number, yy: number, value: number) {
		this._bits[xx * 50 + yy] = value;
	}

	get(xx: number, yy: number) {
		return this._bits[xx * 50 + yy];
	}

	clone() {
		const _bits = new Uint8Array(this._bits);
		return instantiate(CostMatrix, { _bits });
	}

	serialize() {
		return [ ...new Uint32Array(this._bits.buffer, this._bits.byteOffset) ];
	}

	deserialize(data: number[]) {
		const _bits = new Uint8Array(new Uint32Array(data).buffer);
		return instantiate(CostMatrix, { _bits });
	}
}

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
	const internalOptions: SearchOptions = {
		heuristicWeight: options.heuristicWeight,
		maxOps: options.maxOps ?? 20000,
		maxRooms: options.maxRooms,
		plainCost: options.plainCost ?? (ignoreRoads ? 1 : 2),
		swampCost: options.swampCost ?? (ignoreRoads ? 5 : 10),

		roomCallback(roomName) {
			// Get cost matrix for this room
			const costMatrix = getOrSet(cachedCostMatrices, `${roomName}${costMatrixKey}`, () => {
				// Return early if there's no access to this room
				const room = Game.rooms[roomName];
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (!room) {
					return;
				}
				const costMatrix = new CostMatrix;

				// Mark obstacles
				const check = obstacleChecker(room, Game.me, {
					ignoreCreeps,
					ignoreDestructibleStructures,
					pathing: true,
				});
				for (const object of room._objects) {
					const { pos: { x, y } } = object;
					if (check(object)) {
						costMatrix.set(x, y, 0xff);
					} else if (!ignoreRoads && object instanceof StructureRoad) {
						costMatrix.set(x, y, Math.max(1, costMatrix.get(x, y)));
					}
				}
				return costMatrix;
			});

			// Allow user to augment the cost matrix
			if (costCallback) {
				const nextMatrix = costCallback(roomName, costMatrix ?? new CostMatrix);
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
	return search(origin, goalsWithRange, internalOptions);
}

export function use() {}

type ObstacleCheckerOptions = {
	ignoreCreeps?: boolean;
	ignoreDestructibleStructures?: boolean;
	pathing?: boolean;
};
export function obstacleChecker(room: Room, user: string, options: ObstacleCheckerOptions = {}) {
	type Filter = (object: RoomObject) => boolean;
	const { controller } = room;
	const { pathing } = options;
	const creepFilter = function(): Filter {
		if (options.ignoreCreeps) {
			return () => false;
		} else if (controller?.safeMode === undefined) {
			return object => object instanceof Creep;
		} else {
			const safeUser = controller._owner;
			return object => object instanceof Creep && (object._owner === safeUser || user !== safeUser);
		}
	}();
	const structureFilter = function(): Filter {
		if (options.ignoreDestructibleStructures) {
			return object => object instanceof Structure && !destructibleStructureTypes.has(object.structureType);
		} else {
			return object => object instanceof Structure && (
				obstacleTypes.has(object.structureType) ||
				(pathing === true && object.structureType === 'portal'));
		}
	}();
	const constructionSiteFilter = function(): Filter {
		if (pathing) {
			return object => object instanceof ConstructionSite &&
				object._owner === user && obstacleTypes.has(object.structureType);
		} else {
			return () => false;
		}
	}();
	return (object: RoomObject) =>
		creepFilter(object) || structureFilter(object) || constructionSiteFilter(object) ||
		permanentObstacleTypes.has(object[Variant as never]);
}

// Exported Game namespace
export default { CostMatrix, search, use };
