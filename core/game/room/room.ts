import type { InspectOptionsStylized } from 'util';
import type { LooseBoolean } from 'xxscreeps/utility/types';

import * as C from '../constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as Memory from '../memory';
import * as PathFinder from '../path-finder';

import { Direction, RoomPosition, extractPositionId, fetchPositionArgument, getOffsetsFromDirection } from '../position';

import { BufferObject } from 'xxscreeps/schema/buffer-object';
import { BufferView, withOverlay } from 'xxscreeps/schema';
import { iteratee } from 'xxscreeps/engine/util/iteratee';
import { IntentIdentifier } from 'xxscreeps/processor/symbols';

import { AfterInsert, AfterRemove, LookType, RoomObject } from 'xxscreeps/game/object';
import { getTerrainForRoom } from '../map';
import { RoomVisual } from '../visual';

import { EventLogSymbol } from './event-log';
import { FindConstants, FindType, findHandlers } from './find';
import { LookConstants, TypeOfLook, lookConstants } from './look';
import { shape } from './schema';
import { FlushFindCache, LookFor, MoveObject, InsertObject, RemoveObject } from './symbols';

export type AnyRoomObject = RoomObject | InstanceType<typeof Room>['_objects'][number];

export { LookConstants };

type LookForTypeInitial<Type extends LookConstants> = {
	[key in LookConstants]: TypeOfLook<Type>;
} & {
	type: Type;
};

export type LookForType<Type extends RoomObject> = {
	[key in LookConstants]: Type extends TypeOfLook<key> ? Type : never;
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

export class Room extends withOverlay(BufferObject, shape) {
	get memory() {
		const memory = Memory.get();
		const rooms = memory.rooms ?? (memory.rooms = {});
		return rooms[this.name] ?? (rooms[this.name] = {});
	}

	// TODO: Put in mods
	energyAvailable = 0;
	energyCapacityAvailable = 0;

	constructor(view: BufferView, offset: number) {
		super(view, offset);
		for (const object of this._objects as RoomObject[]) {
			object[AfterInsert](this);
			this._addToLookIndex(object);
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
			const type = object[LookType];
			return { type, [type]: object };
		});
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
	[LookFor]<Look extends LookConstants>(this: this, type: Look): TypeOfLook<Look>[] {
		return this.#lookIndex.get(type)! as never[];
	}

	//
	// Private mutation functions
	[FlushFindCache]() {
		this.#findCache.clear();
	}

	[InsertObject](object: RoomObject) {
		// Add to objects & look index then flush find caches
		this._objects.push(object as never);
		this._addToLookIndex(object);
		/* const findTypes = lookToFind[lookType];
		for (const find of findTypes) {
			this.#findCache.delete(find);
		} */
		this.#findCache.clear();
		// Update spatial look cache if it exists
		const spatial = this.#lookSpatialIndex.get(object[LookType]);
		if (spatial) {
			const pos = extractPositionId(object.pos);
			const list = spatial.get(pos);
			if (list) {
				list.push(object);
			} else {
				spatial.set(pos, [ object ]);
			}
		}
		object[AfterInsert](this);
	}

	[RemoveObject](object: RoomObject) {
		// Remove from objects & look index then flush find caches
		removeOne(this._objects, object as never);
		this._removeFromLookIndex(object);
		/* const findTypes = lookToFind[lookType];
		for (const find of findTypes) {
			this.#findCache.delete(find);
		} */
		this.#findCache.clear();
		// Update spatial look cache if it exists
		const spatial = this.#lookSpatialIndex.get(object[LookType]);
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
		object[AfterRemove](this);
	}

	[MoveObject](object: RoomObject, pos: RoomPosition) {
		const spatial = this.#lookSpatialIndex.get(object[LookType]);
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

	private _addToLookIndex(object: RoomObject) {
		this.#lookIndex.get(object[LookType])!.push(object);
	}

	private _removeFromLookIndex(object: RoomObject) {
		removeOne(this.#lookIndex.get(object[LookType])!, object);
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
		Fn.map(lookConstants, look => [ look, [] ]));
	#lookSpatialIndex = new Map<LookConstants, Map<number, RoomObject[]>>();
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
