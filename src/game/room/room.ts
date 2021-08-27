import type { InspectOptionsStylized } from 'util';
import type { Terrain } from 'xxscreeps/game/terrain';
import type { RoomObject } from 'xxscreeps/game/object';
import type { RoomPosition } from 'xxscreeps/game/position';
import type { FindConstants, FindType, RoomFindOptions } from './find';
import type { LookConstants, TypeOfLook } from './look';
import * as Fn from 'xxscreeps/utility/functional';
import { BufferObject, withOverlay } from 'xxscreeps/schema';
import { getOrSet, removeOne } from 'xxscreeps/utility/utility';
import { iteratee } from 'xxscreeps/utility/iteratee';
import { registerGlobal } from 'xxscreeps/game';
import { shape } from './schema';
import { findHandlers, lookConstants } from './symbols';

export type AnyRoomObject = Room['#objects'][number];

/**
 * An object representing the room in which your units and structures are in. It can be used to look
 * around, find paths, etc. Every `RoomObject` in the room contains its linked `Room` instance in
 * the `room` property.
 */
export class Room extends withOverlay(BufferObject, shape) {
	declare static Terrain: typeof Terrain;

	#didInitialize = false;
	#findCache = new Map<number, (RoomObject | RoomPosition)[]>();
	#lookIndex = new Map<string, RoomObject[]>(Fn.map(lookConstants, look => [ look, [] ]));
	#spatialIndex = new Map<number, RoomObject[]>();
	#insertObjects: RoomObject[] = [];
	#removeObjects = new Set<RoomObject>();

	/**
	 * Find all objects of the specified type in the room. Results are cached automatically for the
	 * specified room and type before applying any custom filters. This automatic cache lasts until
	 * the end of the tick.
	 * @param type One of the FIND_* constants
	 * @param opts An object with additional options:
	 *   `filter` - The result list will be filtered using the Lodash.filter method.
	 */
	find<Type extends FindConstants>(this: Room, type: Type, options: RoomFindOptions<FindType<Type>> = {}): FindType<Type>[] {
		// Check find cache
		const results = getOrSet(this.#findCache, type, () => findHandlers.get(type)?.(this) ?? []);

		// Copy or filter result
		return options.filter ? results.filter(iteratee(options.filter)) : results.slice();
	}

	/**
	 * Materialize all `RoomObject` instances and build FIND & LOOK indices
	 */
	['#initialize'](this: Room) {
		if (this.#didInitialize) {
			return;
		}
		this.#didInitialize = true;
		for (const object of this['#objects']) {
			this.#afterInsert(object);
		}
	}

	/**
	 * Returns a plain array of all room objects at a given location.
	 */
	['#lookAt'](pos: RoomPosition): Readonly<AnyRoomObject[]> {
		return (this.#spatialIndex.get(pos['#id']) ?? []) as never[];
	}

	/**
	 * Returns a plain array of all room objects matching `type`
	 */
	['#lookFor']<Look extends LookConstants>(type: Look): Readonly<TypeOfLook<Look>[]> {
		return this.#lookIndex.get(type)! as never[];
	}

	/**
	 * Flushes the cache used by `find` because it sometimes contains user-specific information.
	 */
	['#flushFindCache']() {
		this.#findCache.clear();
	}

	/**
	 * Execute all insert / remove mutations that have been queued with `InsertObject` or
	 * `RemoveObject`.
	 */
	['#flushObjects'](this: Room) {
		// Bail early if there's no work
		if (this.#insertObjects.length === 0 && this.#removeObjects.size === 0) {
			return;
		}
		const objects = this['#objects'];
		this.#findCache.clear();
		// Remove objects
		const removeObjects = this.#removeObjects;
		let removeCount = removeObjects.size;
		if (removeCount) {
			this.#removeObjects = new Set;
			let cursor = objects.length - 1;
			for (let ii = cursor; ii >= 0; --ii) {
				const object = objects[ii];
				if (removeObjects.has(object)) {
					this.#beforeRemove(object);
					objects[ii] = objects[cursor--];
					if (--removeCount === 0) {
						break;
					}
				}
			}
			objects.splice(cursor + 1);

			if (removeCount !== 0) {
				throw new Error('Removed objects mismatch');
			}
		}
		// Insert objects
		const insertObjects = this.#insertObjects;
		if (insertObjects.length) {
			this.#insertObjects = [];
			objects.push(...insertObjects as never[]);
			for (const object of insertObjects) {
				this.#afterInsert(object);
			}
		}
		// Don't attempt to double remove objects queued from hooks
		for (const object of this.#removeObjects) {
			if (removeObjects.has(object)) {
				this.#removeObjects.delete(object);
			}
		}
		// Flush objects added/removed by #afterInsert / #beforeRemove hooks
		this['#flushObjects']();
	}

	/**
	 * Queue an object to be inserted into this room. This is flushed via `FlushObjects`.
	 */
	['#insertObject'](this: Room, object: RoomObject, now = false) {
		if (now) {
			this.#findCache.clear();
			this['#objects'].push(object as never);
			this.#afterInsert(object);
		} else {
			this.#insertObjects.push(object);
		}
	}

	/**
	 * Queue an object to be removed from this room. This is flushed via `FlushObjects`.
	 */
	['#removeObject'](object: RoomObject) {
		this.#removeObjects.add(object);
	}

	/**
	 * Move an object to a new position within this room. This is reflected in the local room state
	 * immediately.
	 */
	['#moveObject'](object: RoomObject, pos: RoomPosition) {
		const oldPosition = object.pos['#id'];
		const oldList = this.#spatialIndex.get(oldPosition)!;
		if (oldList.length === 1) {
			this.#spatialIndex.delete(oldPosition);
		} else {
			removeOne(oldList, object);
		}
		const posInteger = pos['#id'];
		const newList = this.#spatialIndex.get(posInteger);
		if (newList) {
			newList.push(object);
		} else {
			this.#spatialIndex.set(posInteger, [ object ]);
		}
		object.pos = pos;
		object['#posId'] = posInteger;
	}

	/**
	 * Add an object to the look and spatial indices
	 */
	#afterInsert(this: Room, object: RoomObject) {
		this.#lookIndex.get(object['#lookType'])!.push(object);
		const pos = object['#posId'];
		const list = this.#spatialIndex.get(pos);
		if (list) {
			list.push(object);
		} else {
			this.#spatialIndex.set(pos, [ object ]);
		}
		object['#afterInsert'](this);
	}

	/**
	 * Remove an object from the look and spatial indices
	 */
	#beforeRemove(object: RoomObject) {
		object['#beforeRemove']();
		removeOne(this.#lookIndex.get(object['#lookType'])!, object);
		const pos = object['#posId'];
		const list = this.#spatialIndex.get(pos)!;
		if (list.length === 1) {
			this.#spatialIndex.delete(pos);
		} else {
			removeOne(list, object);
		}
	}

	/**
	 * Enumerable objects properties like `.storage` and `.controller` are removed from the JSON
	 * serialized data because otherwise there will be circular references.
	 */
	private toJSON() {
		const result: any = {};
		for (const ii in this) {
			const value: any = this[ii];
			if (!(typeof value === 'object' && value.room === this)) {
				result[ii] = this[ii];
			}
		}
		return result;
	}

	private override toString() {
		return `[Room ${this.name}]`;
	}

	private [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptionsStylized) {
		// Every object has a `room` property so flatten this reference out unless it's a direct
		// inspection
		if (depth === options.depth) {
			return this;
		} else {
			return `[Room ${options.stylize(this.name, 'string')}]`;
		}
	}
}

// Export `Room` to runtime globals
registerGlobal(Room);
declare module 'xxscreeps/game/runtime' {
	interface Global { Room: typeof Room }
}

/**
 * Updates top-level user presence information based on current RoomObjects. This must be called
 * before saving a room after modification.
 */
export function flushUsers(room: Room) {
	const intents = new Set<string>();
	const presence = new Set<string>();
	const vision = new Set<string>();
	const extra = new Set<string>();
	for (const object of room['#objects']) {
		const user = object['#user'];
		if (user !== null) {
			presence.add(user);
			if (object['#hasIntent']) {
				intents.add(user);
			}
			if (object['#providesVision']) {
				vision.add(user);
			}
		}
		for (const userId of object['#extraUsers']) {
			extra.add(userId);
		}
	}
	const user = room['#user'];
	if (user) {
		presence.add(user);
	}
	const previous = room['#users'];
	room['#users'] = {
		intents: [ ...intents ],
		presence: [ ...presence ],
		vision: [ ...vision ],
		extra: [ ...extra ],
	};
	return previous;
}
