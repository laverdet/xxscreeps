import { search } from '~/driver/pathfinder';
import * as C from '~/game/constants';
import { Variant } from '~/lib/schema';
import { getOrSet, instantiate } from '~/lib/utility';
import { RoomPosition } from './position';
import { Objects } from './room';
import { Creep } from './objects/creep';
export { search };

export class CostMatrix {
	_bits = new Uint8Array(2500);

	set(xx: number, yy: number, value: number) {
		this._bits[yy * 50 + xx] = value;
	}

	get(xx: number, yy: number) {
		return this._bits[yy * 50 + xx];
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
	costCallback?: (roomName: string, costMatrix: CostMatrix) => CostMatrix | undefined;
	ignoreCreeps?: boolean;
	ignoreDestructibleStructures?: boolean;
	ignoreRoads?: boolean;
	range?: number;
};

const destructibleStructures = [
	'constructedWall',
	'extension',
	'lab',
	'link',
	'observer',
	'powerBank',
	'powerSpawn',
	'spawn',
	'storage',
	'terminal',
	'tower',
];

const cachedCostMatrices = new Map<string, CostMatrix | undefined>();

export function flush() {
	cachedCostMatrices.clear();
}

export function roomSearch(origin: RoomPosition, goals: RoomPosition[], options: RoomSearchOptions = {}) {
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
		plainCost: options.plainCost ?? (ignoreRoads ? 2 : undefined),
		swampCost: options.swampCost ?? (ignoreRoads ? 10 : undefined),

		roomCallback(roomName) {
			// Get cost matrix for this room
			const costMatrix = getOrSet(cachedCostMatrices, `${roomName}${costMatrixKey}`, () => {
				// Return early if there's no access to this room
				const room = Game.rooms[roomName];
				if (!room) {
					return;
				}
				const costMatrix = new CostMatrix;

				// Set up obstacle types
				const obstacleTypes = new Set(C.OBSTACLE_OBJECT_TYPES);
				obstacleTypes.add('portal');
				if (ignoreDestructibleStructures) {
					for (const type of destructibleStructures) {
						obstacleTypes.delete(type);
					}
				}

				// TODO: roads & ramparts

				const creepFilter = function() {
					if (ignoreCreeps) {
						return () => false;
					} else if (room.controller?.my && room.controller.safeMode !== undefined) {
						return (creep: Creep) => creep.my;
					} else {
						return () => true;
					}
				}();

				// Mark obstacles
				for (const object of room[Objects]) {
					if (object instanceof Creep) {
						if (creepFilter(object)) {
							costMatrix.set(object.pos.x, object.pos.y, 0xff);
						}
					} else if (obstacleTypes.has(object[Variant])) {
						costMatrix.set(object.pos.x, object.pos.y, 0xff);
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
/*
	// Convert to room path
	const path: any[] = [];
	const { roomName } = origin;
	let previous = origin;
	for (const pos of result.path) {
		if (pos.roomName !== roomName) {
			break;
		}
		path.push({
			x: pos.x,
			y: pos.y,
			dx: pos.x - previous.x,
			dy: pos.y - previous.y,
			direction: previous.getDirectionTo(pos),
		});
		previous = pos;
	}
	return path;*/
}

export function use() {}
