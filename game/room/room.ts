import * as C from '../constants';
import type { InspectOptionsStylized } from 'util';

import { BufferObject } from 'xxscreeps/schema/buffer-object';
import type { BufferView } from 'xxscreeps/schema/buffer-view';
import { withOverlay } from 'xxscreeps/schema';
import type { LooseBoolean } from 'xxscreeps/util/types';
import { accumulate, concatInPlace, mapInPlace } from 'xxscreeps/util/utility';
import { iteratee } from 'xxscreeps/engine/util/iteratee';
import { IntentIdentifier } from 'xxscreeps/processor/symbols';

import * as Game from '../game';
import * as Memory from '../memory';
import {
	extractPositionId,
	fetchArguments, fetchPositionArgument,
	getOffsetsFromDirection,
	iterateNeighbors,
	Direction, RoomPosition,
} from '../position';
import * as PathFinder from '../path-finder';
import { getTerrainForRoom } from '../map';
import { isBorder, isNearBorder } from '../terrain';

import { ConstructibleStructureType } from '../objects/construction-site';
import { chainIntentChecks, RoomObject } from '../objects/room-object';
import { StructureController } from '../objects/structures/controller';
import { StructureExtension } from '../objects/structures/extension';
import { StructureSpawn } from '../objects/structures/spawn';
import { RoomVisual } from '../visual';

import { EventLogSymbol } from './event-log';
import { FindConstants, FindType, findHandlers } from './find';
import { LookConstants, LookType, lookConstants } from './look';
import { shape } from './schema';
import { LookFor, MoveObject, InsertObject, RemoveObject } from './symbols';

export type AnyRoomObject = RoomObject | InstanceType<typeof Room>['_objects'][number];

export { LookConstants };

type LookForTypeInitial<Type extends LookConstants> = {
	[key in LookConstants]: LookType<Type>;
} & {
	type: Type;
};

export type LookForType<Type extends RoomObject> = {
	[key in LookConstants]: Type extends LookType<key> ? Type : never;
} & {
	type: never;
};

export type FindPathOptions = PathFinder.RoomSearchOptions & {
	serialize?: boolean;
};
export type RoomFindOptions<Type = any> = {
	filter?: string | object | ((object: Type) => LooseBoolean);
};

export type RoomPath = {
	x: number;
	y: number;
	dx: -1 | 0 | 1;
	dy: -1 | 0 | 1;
	direction: Direction;
}[];

export class Room extends withOverlay(shape)(BufferObject) {
	get memory() {
		const memory = Memory.get();
		const rooms = memory.rooms ?? (memory.rooms = {});
		return rooms[this.name] ?? (rooms[this.name] = {});
	}

	controller?: StructureController;
	energyAvailable = 0;
	energyCapacityAvailable = 0;

	constructor(view: BufferView, offset = 0) {
		super(view, offset);
		for (const object of this._objects) {
			this._afterInsertion(object);
		}
	}

	/**
	 * Find all objects of the specified type in the room. Results are cached automatically for the
	 * specified room and type before applying any custom filters. This automatic cache lasts until
	 * the end of the tick.
	 * @param type One of the FIND_* constants
	 * @param opts
	 */
	find<Type extends FindConstants>(
		type: Type,
		options: RoomFindOptions<FindType<Type>> = {},
	): FindType<Type>[] {
		// Check find cache
		let results = this.#findCache.get(type);
		if (results === undefined) {
			this.#findCache.set(type, results = findHandlers.get(type)?.(this) ?? []);
		}

		// Copy or filter result
		return (options.filter === undefined ? results.slice() : results.filter(iteratee(options.filter))) as never;
	}

	/**
	 * Find the exit direction en route to another room. Please note that this method is not required
	 * for inter-room movement, you can simply pass the target in another room into Creep.moveTo
	 * method.
	 * @param room Another room name or room object
	 */
	findExitTo(/*room: Room | string*/): /*FindExitDirection | */typeof C.ERR_NO_PATH | typeof C.ERR_INVALID_ARGS {
		return C.ERR_NO_PATH;
	}

	/**
	 * Find an optimal path inside the room between fromPos and toPos using Jump Point Search algorithm.
	 * @param origin The start position
	 * @param goal The end position
	 * @param options
	 */
	findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize?: false }): RoomPath;
	findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize: true }): string;
	findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize?: boolean }): RoomPath | string;
	findPath(origin: RoomPosition, goal: RoomPosition, options: FindPathOptions & { serialize?: boolean } = {}) {

		// Delegate to `PathFinder` and convert the result
		const result = PathFinder.roomSearch(origin, [ goal ], options);
		const path: any[] = [];
		let previous = origin;
		for (const pos of result.path) {
			if (pos.roomName !== this.name) {
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
		if (options.serialize) {
			return this.serializePath(path);
		}
		return path;
	}

	/**
	 * Serialize a path array into a short string representation, which is suitable to store in memory
	 * @param path A path array retrieved from Room.findPath
	 */
	serializePath(path: RoomPath) {
		if (!Array.isArray(path)) {
			throw new Error('`path` is not an array');
		}
		if (path.length === 0) {
			return '';
		}
		if (path[0].x < 0 || path[0].y < 0) {
			throw new Error('path coordinates cannot be negative');
		}
		let result = `${path[0].x}`.padStart(2, '0') + `${path[0].y}`.padStart(2, '0');
		for (const step of path) {
			result += step.direction;
		}
		return result;
	}

	/**
	 * Deserialize a short string path representation into an array form
	 * @param path A serialized path string
	 */
	deserializePath(path: string) {
		if (typeof path !== 'string') {
			throw new Error('`path` is not a string');
		}
		const result: RoomPath = [];
		if (path.length === 0) {
			return result;
		}

		let x = Number(path.substr(0, 2));
		let y = Number(path.substr(2, 2));
		if (Number.isNaN(x) || Number.isNaN(y)) {
			throw new Error('`path` is not a valid serialized path string');
		}
		for (let ii = 4; ii < path.length; ++ii) {
			const direction = Number(path[ii]) as Direction;
			const { dx, dy } = getOffsetsFromDirection(direction);
			if (ii > 4) {
				x += dx;
				y += dy;
			}
			result.push({
				x, y,
				dx, dy,
				direction,
			});
		}
		return result;
	}

	/**
	 * Get a Room.Terrain object which provides fast access to static terrain data. This method works
	 * for any room in the world even if you have no access to it.
	 */
	getTerrain() {
		return getTerrainForRoom(this.name)!;
	}

	/**
	 * Get an object with the given type at the specified room position.
	 * @param type One of the `LOOK_*` constants
	 * @param x X position in the room
	 * @param y Y position in the room
	 * @param target Can be a RoomObject or RoomPosition
	 */
	lookForAt<Type extends LookConstants>(type: Type, x: number, y: number): LookForTypeInitial<Type>[];
	lookForAt<Type extends LookConstants>(type: Type, target: RoomObject | RoomPosition): LookForTypeInitial<Type>[];
	lookForAt<Type extends LookConstants>(
		type: Type, ...rest: [ number, number ] | [ RoomObject | RoomPosition ]
	) {
		const { pos } = fetchPositionArgument(this.name, ...rest);
		if (!pos || pos.roomName !== this.name) {
			return [];
		}
		if (!lookConstants.has(type)) {
			return C.ERR_INVALID_ARGS as any;
		}
		const objects = this._getSpatialIndex(type);
		return (objects.get(extractPositionId(pos)) ?? []).map(object => {
			const type = object._lookType;
			return { type, [type]: object };
		});
	}

	/**
	 * Create new `ConstructionSite` at the specified location.
	 * @param structureType One of the `STRUCTURE_*` constants.
	 * @param name The name of the structure, for structures that support it (currently only spawns).
	 */
	 createConstructionSite(x: number, y: number, structureType: ConstructibleStructureType, name?: string): number;
	 createConstructionSite(pos: RoomPosition, structureType: ConstructibleStructureType, name?: string): number;
	 createConstructionSite(this: Room, ...args: any[]) {

		// Extract overloaded parameters
		const { xx, yy, rest } = fetchArguments(...args);
		if (args[0] instanceof RoomPosition && args[0].roomName !== this.name) {
			return C.ERR_INVALID_ARGS;
		}
		const pos = new RoomPosition(xx, yy, this.name);
		const [ structureType, name ] = rest;

		// Send it off
		return chainIntentChecks(
			() => {
				if (structureType === 'spawn' && typeof name === 'string') {
					// TODO: Check newly created spawns too
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					if (Game.spawns[name]) {
						return C.ERR_INVALID_ARGS;
					}
				}
				return C.OK;
			},
			() => checkCreateConstructionSite(this, pos, structureType),
			() => Game.intents.push(this, 'createConstructionSite', structureType, xx, yy, name));
	}

	/**
	 * Returns an array of events happened on the previous tick in this room.
	 * @param raw Return as JSON string.
	 */
	getEventLog(raw?: boolean) {
		if (raw) {
			throw new Error('Don\'t use this');
		} else {
			return this[EventLogSymbol];
		}
	}

	get visual() {
		return new RoomVisual;
	}

	//
	// Private functions
	[LookFor]<Look extends LookConstants>(this: this, type: Look): LookType<Look>[] {
		return this.#lookIndex.get(type)! as never[];
	}

	//
	// Private mutation functions
	[InsertObject](this: this, object: RoomObject) {
		// Add to objects & look index then flush find caches
		this._objects.push(object as never);
		this._afterInsertion(object);
		/* const findTypes = lookToFind[lookType];
		for (const find of findTypes) {
			this.#findCache.delete(find);
		} */
		this.#findCache.clear();
		// Update spatial look cache if it exists
		const spatial = this.#lookSpatialIndex.get(object._lookType);
		if (spatial) {
			const pos = extractPositionId(object.pos);
			const list = spatial.get(pos);
			if (list) {
				list.push(object);
			} else {
				spatial.set(pos, [ object ]);
			}
		}
	}

	[RemoveObject](this: this, object: RoomObject) {
		// Remove from objects & look index then flush find caches
		removeOne(this._objects, object);
		this._afterRemoval(object);
		/* const findTypes = lookToFind[lookType];
		for (const find of findTypes) {
			this.#findCache.delete(find);
		} */
		this.#findCache.clear();
		// Update spatial look cache if it exists
		const spatial = this.#lookSpatialIndex.get(object._lookType);
		if (spatial) {
			const pos = extractPositionId(object.pos);
			const list = spatial.get(pos);
			if (list) {
				removeOne(list, object);
				if (list.length === 0) {
					spatial.delete(pos);
				}
			}
		}
	}

	[MoveObject](this: this, object: RoomObject, pos: RoomPosition) {
		const spatial = this.#lookSpatialIndex.get(object._lookType);
		if (spatial) {
			const oldPosition = extractPositionId(object.pos);
			const oldList = spatial.get(oldPosition)!;
			removeOne(oldList, object);
			if (oldList.length === 0) {
				spatial.delete(oldPosition);
			}
			object.pos = pos;
			const posInteger = extractPositionId(pos);
			const newList = spatial.get(posInteger);
			if (newList) {
				newList.push(object);
			} else {
				spatial.set(posInteger, [ object ]);
			}
		} else {
			object.pos = pos;
		}
	}

	// `_afterInsertion` is called on Room construction per object to batch add objects. It skips the
	// find cache and spatial indices because those will be clean anyway
	private _afterInsertion(object: RoomObject) {
		object.room = this;
		const lookType = object._lookType;
		this.#lookIndex.get(lookType)!.push(object);
		if (lookType === C.LOOK_STRUCTURES) {
			if (object instanceof StructureController) {
				this.controller = object;
			} else if (object instanceof StructureExtension || object instanceof StructureSpawn) {
				this.energyAvailable += object.store[C.RESOURCE_ENERGY];
				this.energyCapacityAvailable += object.store.getCapacity(C.RESOURCE_ENERGY);
			}
		}
	}

	private _afterRemoval(object: RoomObject) {
		object.room = null as any;
		const lookType = object._lookType;
		const list = this.#lookIndex.get(lookType)!;
		removeOne(list, object);
		if (lookType === C.LOOK_STRUCTURES) {
			if (object instanceof StructureController) {
				this.controller = object;
			} else if (object instanceof StructureExtension || object instanceof StructureSpawn) {
				this.energyAvailable -= object.store[C.RESOURCE_ENERGY];
				this.energyCapacityAvailable -= object.store.getCapacity(C.RESOURCE_ENERGY);
			}
		}
		return lookType;
	}

	// Returns objects indexed by type and position
	private _getSpatialIndex(look: LookConstants) {
		const cached = this.#lookSpatialIndex.get(look);
		if (cached) {
			return cached;
		}
		const spatial = new Map<number, RoomObject[]>();
		this.#lookSpatialIndex.set(look, spatial);
		for (const object of this.#lookIndex.get(look)!) {
			const pos = extractPositionId(object.pos);
			const list = spatial.get(pos);
			if (list) {
				list.push(object);
			} else {
				spatial.set(pos, [ object ]);
			}
		}
		return spatial;
	}

	get [IntentIdentifier]() {
		return { group: 'room' as const, name: this.name };
	}

	//
	// Debug utilities
	toString() {
		return `[Room ${this.name}]`;
	}

	[Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptionsStylized) {
		// Every object has a `room` property so flatten this reference out unless it's a direct
		// inspection
		if (depth === options.depth) {
			return this;
		} else {
			return `[Room ${options.stylize(this.name, 'string')}]`;
		}
	}

	#findCache = new Map<number, (RoomObject | RoomPosition)[]>();
	#lookIndex = new Map<LookConstants, RoomObject[]>(
		mapInPlace(lookConstants, look => [ look, [] ]));
	#lookSpatialIndex = new Map<LookConstants, Map<number, RoomObject[]>>();
}

//
// Intent checks
export function checkCreateConstructionSite(room: Room, pos: RoomPosition, structureType: ConstructibleStructureType) {
	// Check `structureType` is buildable
	if (!(C.CONSTRUCTION_COST[structureType] > 0)) {
		return C.ERR_INVALID_ARGS;
	}

	// Can't build in someone else's room
	if (room.controller) {
		if (room.controller._owner !== null && !room.controller.my) {
			return C.ERR_RCL_NOT_ENOUGH;
		}
	}

	// Check structure count for this RCL
	const rcl = room.controller?.level ?? 0;
	if (rcl === 0 && structureType === 'spawn') {
		// TODO: GCL check here
		if (!room.controller) {
			return C.ERR_RCL_NOT_ENOUGH;
		}
	} else {
		const existingCount = accumulate(concatInPlace(
			room.find(C.FIND_STRUCTURES),
			room.find(C.FIND_CONSTRUCTION_SITES),
		), object => object.structureType === structureType ? 1 : 0);
		if (existingCount >= C.CONTROLLER_STRUCTURES[structureType][rcl]) {
			// TODO: Check constructions sites made this tick too
			return C.ERR_RCL_NOT_ENOUGH;
		}
	}

	// No structures on borders
	if (isNearBorder(pos.x, pos.y)) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures next to borders unless it's against a wall, or it's a road/container
	const terrain = room.getTerrain();
	if (structureType !== 'road' && structureType !== 'container' && isNearBorder(pos.x, pos.y)) {
		for (const neighbor of iterateNeighbors(pos)) {
			if (
				isBorder(neighbor.x, neighbor.y) &&
				terrain.get(neighbor.x, neighbor.y) !== C.TERRAIN_MASK_WALL
			) {
				return C.ERR_INVALID_TARGET;
			}
		}
	}

	// No structures on walls except for roads and extractors
	if (
		structureType !== 'extractor' && structureType !== 'road' &&
		terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL
	) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures on top of others
	for (const object of concatInPlace(
		room.find(C.FIND_CONSTRUCTION_SITES),
		room.find(C.FIND_STRUCTURES),
	)) {
		if (
			object.pos.isEqualTo(pos) &&
			(object.structureType === structureType ||
				(structureType !== 'rampart' && structureType !== 'road' &&
				object.structureType !== 'rampart' && object.structureType !== 'road'))
		) {
			return C.ERR_INVALID_TARGET;
		}
	}

	// TODO: Extractors must be built on mineral
	// TODO: Limit total construction sites built

	return C.OK;
}

//
// Utilities
function removeOne<Type>(list: Type[], element: Type) {
	const index = list.indexOf(element);
	if (index === -1) {
		throw new Error('Removed object was not found');
	}
	list.splice(index, 1);
}
