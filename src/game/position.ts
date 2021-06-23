import type { Direction } from './direction';
import type { InspectOptionsStylized } from 'util';
import type { FindConstants, FindType, RoomFindOptions } from './room/find';
import type { LookConstants } from './room/look';
import type { FindPathOptions, RoomPath } from './room/path';
import type { RoomObject } from './object';
import * as PathFinder from './path-finder';
import * as Fn from 'xxscreeps/utility/functional';
import { Game, registerGlobal } from '.';
import { compose, declare } from 'xxscreeps/schema';
import { iteratee } from 'xxscreeps/utility/iteratee';
import { getDirection } from './direction';
import { generateRoomNameFromId, kMaxWorldSize, parseRoomName } from './room/name';

export type { Direction } from './direction';
export { isBorder, isNearBorder } from './terrain';
export { getOffsetsFromDirection, getPositionInDirection, iterateNeighbors } from './direction';
export { generateRoomName, generateRoomNameFromId, parseRoomName, parseRoomNameToId } from './room/name';

type FindClosestByPathOptions<Type> =
	RoomFindOptions<Type> & Omit<PathFinder.RoomSearchOptions, 'range'>;

type PositionFindType<Type> =
	Type extends (infer Result)[] ? Result :
	Type extends FindConstants ? FindType<Type> :
	never;

export type PositionParameter = [ position: RoomPosition ] | [ target: RoomObject ] | [ x: number, y: number ];

export function format() {
	return declare('RoomPosition', compose('int32', {
		compose: pos => RoomPosition['#create'](pos),
		decompose: (pos: RoomPosition) => pos['#id'],
		kaitai: [ {
			id: 'rx',
			type: 's1',
		}, {
			id: 'ry',
			type: 's1',
		}, {
			id: 'x',
			type: 's1',
		}, {
			id: 'y',
			type: 's1',
		} ],
	}));
}

const RawPositionId = Symbol('defaultRoomPosition');

/**
 * An object representing the specified position in the room. Every `RoomObject` in a room contains
 * a `RoomPosition` as the `pos` property. A position object for a custom location can be obtained
 * using the `Room.getPositionAt` method or using the constructor.
 */
export class RoomPosition {
	#id;

	/** @internal */
	constructor(xx: typeof RawPositionId, id: number, roomName?: unknown);

	/**
	 * You can create new RoomPosition object using its constructor.
	 * @param xx X position in the room.
	 * @param yy Y position in the room.
	 * @param roomName The room name.
	 */
	constructor(xx: number, yy: number, roomName: string);

	constructor(xx: number | typeof RawPositionId, yy: number, roomName: string) {
		if (xx === RawPositionId) {
			this.#id = yy;
		} else {
			const { rx, ry } = parseRoomName(roomName);
			if (
				!(rx >= 0 && rx < kMaxWorldSize) ||
				!(ry >= 0 && ry < kMaxWorldSize) ||
				!(xx >= 0 && xx < 50) ||
				!(yy >= 0 && yy < 50)
			) {
				throw new TypeError('Invalid arguments in `RoomPosition` constructor');
			}
			this.#id = yy << 24 | xx << 16 | ry << 8 | rx;
		}
	}

	static ['#create'](pos: number) {
		return new RoomPosition(RawPositionId, pos);
	}

	get ['#id']() {
		return this.#id;
	}

	/**
	 * The name of the room.
	 */
	@enumerable get roomName() {
		return generateRoomNameFromId(this.#id & 0xffff);
	}

	set roomName(roomName: string) {
		const { rx, ry } = parseRoomName(roomName);
		if (
			!(rx >= 0 && rx < kMaxWorldSize) ||
			!(ry >= 0 && ry < kMaxWorldSize)
		) {
			throw new TypeError('Invalid `roomName`');
		}
		this.#id = this.#id & ~0xffff | ry << 8 | rx;
	}

	/**
	 * X position in the room.
	 */
	@enumerable get x() {
		return (this.#id >>> 16) & 0xff;
	}

	set x(xx: number) {
		if (!(xx >= 0 && xx < 50)) {
			throw new TypeError('Invalid `x`');
		}
		this.#id = this.#id & ~(0xff << 16) | xx << 16;
	}

	/**
	 * Y position in the room.
	 */
	@enumerable get y() {
		return this.#id >>> 24;
	}

	set y(yy: number) {
		if (!(yy >= 0 && yy < 50)) {
			throw new TypeError('Invalid `y`');
		}
		this.#id = this.#id & ~(0xff << 24) | yy << 24;
	}

	getDirectionTo(x: number, y: number): Direction;
	getDirectionTo(pos: RoomObject | RoomPosition): Direction;
	getDirectionTo(...args: [ number, number ] | [ RoomObject | RoomPosition ]) {
		const { xx, yy, room } = fetchArguments(...args);
		if (room === 0 || (this.#id & 0xffff) === room) {
			return getDirection(xx - this.x, yy - this.y);
		}
		// TODO: Multi-room distance
	}

	/**
	 * Get linear range to the specified position
	 * @param x X position in the same room
	 * @param y Y position in the same room
	 * @param target Can be a RoomObject or RoomPosition
	 */
	getRangeTo(x: number, y: number): number;
	getRangeTo(target: RoomObject | RoomPosition): number;
	getRangeTo(...args: [ number, number ] | [ RoomObject | RoomPosition ]) {
		const { xx, yy, room } = fetchArguments(...args);
		if (room !== 0 && (this.#id & 0xffff) !== room) {
			return Infinity;
		}
		return Math.max(Math.abs(this.x - xx), Math.abs(this.y - yy));
	}

	/**
	 * Check whether this position is the same as the specified position
	 * @param x X position in the same room
	 * @param y Y position in the same room
	 * @param target Can be a RoomObject or RoomPosition
	 */
	isEqualTo(x: number, y: number): boolean;
	isEqualTo(target: RoomObject | RoomPosition): boolean;
	isEqualTo(...args: [ number, number ] | [ RoomObject | RoomPosition ]) {
		const { pos } = fetchPositionArgument(this.roomName, ...args);
		return this.#id === (pos ? pos.#id : 0);
	}

	/**
	 * Check whether this position is on the adjacent square to the specified position. The same as
	 * `position.inRangeTo(target, 1)`
	 * @param x X position in the same room
	 * @param y Y position in the same room
	 * @param target Can be a RoomObject or RoomPosition
	 */
	isNearTo(x: number, y: number): boolean;
	isNearTo(target: RoomObject | RoomPosition): boolean;
	isNearTo(...args: [any]) {
		return this.getRangeTo(...args) <= 1;
	}

	/**
	 * Check whether this position is in the given range of another position.
	 * @param x X position in the same room
	 * @param y Y position in the same room
	 * @param target Can be a RoomObject or RoomPosition
	 * @param range The range distance
	 */
	inRangeTo(x: number, y: number, range: number): boolean;
	inRangeTo(target: RoomObject | RoomPosition, range: number): boolean;
	inRangeTo(...args: [ number, number, number ] | [ RoomObject | RoomPosition, number ]) {
		const { xx, yy, room, rest } = fetchArguments(...args);
		if (room !== 0 && (this.#id & 0xffff) !== room) {
			return false;
		}
		const range = Math.max(Math.abs(this.x - xx), Math.abs(this.y - yy));
		return range <= rest[0];
	}

	/**
	 * Find an object with the shortest path from the given position
	 * @param search One of the `FIND_*` constants. See `Room.find`.
	 * @param search An array of RoomObjects or RoomPosition objects that the search should be
	 * executed against.
	 * @params options See `Room.find`
	 */
	findClosestByPath<Type extends FindConstants | (RoomObject | RoomPosition)[]>(
		search: Type, options?: FindClosestByPathOptions<PositionFindType<Type>>
	): PositionFindType<Type> | null;
	findClosestByPath(
		search: FindConstants | (RoomObject | RoomPosition)[],
		options: FindClosestByPathOptions<any> = {},
	): RoomObject | RoomPosition | null {

		// Find objects to search
		const objects = typeof search === 'number' ?
			fetchRoom(this.roomName).find(search) : search;
		const filtered = options.filter === undefined ? objects :
			objects.filter(iteratee(options.filter));
		const goals = filtered.map(object => 'pos' in object ? object.pos : object);

		// Invoke pathfinder
		const result = PathFinder.roomSearch(this, goals, { ...options, maxRooms: 1 });
		if (result.incomplete) {
			return null;
		}

		// Match position to object
		const { path } = result;
		const last = path[path.length - 1] ?? this;
		return Fn.firstMatching(filtered, object => last.isNearTo(object)) ?? null;
	}

	/**
	 * Find an object with the shortest linear distance from the given position
	 * @param search One of the `FIND_*` constants. See `Room.find`.
	 * @param search An array of RoomObjects or RoomPosition objects that the search should be
	 * executed against.
	 * @param options See `Room.find`
	 */
	findClosestByRange<Type extends FindConstants | (RoomObject | RoomPosition)[]>(
		search: Type,
		options?: RoomFindOptions<PositionFindType<Type>>,
	): PositionFindType<Type> | null;
	findClosestByRange(
		search: FindConstants | (RoomObject | RoomPosition)[],
		options?: RoomFindOptions,
	) {

		// Find objects to search
		const objects = typeof search === 'number' ?
			fetchRoom(this.roomName).find(search) : search;
		const filtered = options?.filter === undefined ? objects :
			objects.filter(iteratee(options.filter));
		return Fn.minimum(filtered, (left, right) =>
			this.getRangeTo(left) - this.getRangeTo(right)) ?? null;
	}

	/**
	 * Find all objects in the specified linear range
	 * @param search One of the `FIND_*` constants. See `Room.find`.
	 * @param search An array of RoomObjects or RoomPosition objects that the search should be
	 * executed against.
	 * @param range The range distance
	 * @param options See `Room.find`
	 */
	findInRange<Type extends FindConstants | (RoomObject | RoomPosition)[]>(
		search: Type,
		range: number,
		options?: RoomFindOptions<PositionFindType<Type>>,
	): PositionFindType<Type>[];
	findInRange(
		search: FindConstants | RoomObject[] | RoomPosition[],
		range: number,
		options?: FindClosestByPathOptions<any>,
	) {

		// Find objects to search
		const objects: (RoomObject | RoomPosition)[] = typeof search === 'number' ?
			fetchRoom(this.roomName).find(search) : search;

		// Filter out in range & matching
		const inRange = objects.filter(object => this.inRangeTo(object, range));
		return options?.filter === undefined ? inRange :
			inRange.filter(iteratee(options.filter));
	}

	/**
	 * Find an optimal path to the specified position using Jump Point Search algorithm. This method
	 * is a shorthand for Room.findPath. If the target is in another room, then the corresponding exit
	 * will be used as a target.
	 * @param x X position in the room
	 * @param y Y position in the room
	 * @param pos Can be a RoomPosition object or any object containing RoomPosition
	 */
	findPathTo(x: number, y: number, options: FindPathOptions & { serialize?: false }): RoomPath;
	findPathTo(target: RoomObject | RoomPosition, options?: FindPathOptions & { serialize?: false }): RoomPath;
	findPathTo(x: number, y: number, options: FindPathOptions & { serialize: true }): string;
	findPathTo(target: RoomObject | RoomPosition, options: FindPathOptions & { serialize: true }): string;
	findPathTo(x: number, y: number, options: FindPathOptions & { serialize?: boolean }): RoomPath | string;
	findPathTo(target: RoomObject | RoomPosition, options?: FindPathOptions & { serialize?: boolean }): RoomPath | string;
	findPathTo(...args: any): RoomPath | string {
		const { pos, extra } = fetchPositionArgument(this.roomName, ...args);
		return fetchRoom(this.roomName).findPath(this, pos!, extra);
	}

	/**
	 * Get an object with the given type at the specified room position
	 * @param type One of the `LOOK_*` constants
	 */
	lookFor(type: LookConstants) {
		return fetchRoom(this.roomName).lookForAt(type, this);
	}

	private toJSON() {
		return { x: this.x, y: this.y, roomName: this.roomName };
	}

	private toString() {
		return `[room ${this.roomName} pos ${this.x},${this.y}]`;
	}

	private [Symbol.for('nodejs.util.inspect.custom')](depth: number, { stylize }: InspectOptionsStylized) {
		return `[RoomPosition ${stylize(this.roomName, 'string')} {${stylize(`${this.x}`, 'number')}, ${stylize(`${this.y}`, 'number')}}]`;
	}
}

registerGlobal(RoomPosition);
declare module './runtime' {
	interface Global { RoomPosition: typeof RoomPosition }
}

//
// Function argument handlers
export function fetchArguments(arg1?: any, arg2?: any, arg3?: any, ...rest: any) {
	if (typeof arg1 === 'object' && arg1 !== null) {
		const int = arg1['#id'] ?? arg1?.pos?.['#id'];
		if (int === undefined) {
			return {
				xx: arg1.x,
				yy: arg1.y,
				room: 0,
				rest: [ arg2, arg3, ...rest ],
			};
		} else {
			return {
				xx: (int >>> 16) & 0xff,
				yy: (int >>> 24) & 0xff,
				room: int & 0xffff,
				rest: [ arg2, arg3, ...rest ],
			};
		}
	}
	return {
		xx: arg1 as number,
		yy: arg2 as number,
		room: 0,
		rest: [ arg3, ...rest ],
	};
}

export function fetchPositionArgument<Extra = any>(
	fromRoom: string, arg1?: any, arg2?: any, arg3?: any,
): { pos?: RoomPosition; extra?: Extra } {
	if (typeof arg1 === 'object' && arg1 !== null) {
		if (arg1 instanceof RoomPosition) {
			return { pos: arg1, extra: arg2 };
		} else if (arg1.pos instanceof RoomPosition) {
			return { pos: arg1.pos, extra: arg2 };
		}
	}
	try {
		return {
			pos: new RoomPosition(arg1, arg2, fromRoom),
			extra: arg3,
		};
	} catch (err) {
		return {
			pos: undefined,
			extra: undefined,
		};
	}
}

export function fetchPositionArgumentRest<Rest extends any[]>(
	fromRoom: string,
	arg1: any, arg2: any, ...rest: Rest
): { pos?: RoomPosition; rest: Rest } {
	if (typeof arg1 === 'object' && arg1 !== null) {
		if (arg1 instanceof RoomPosition) {
			return { pos: arg1, rest: [ arg2, ...rest ] as never };
		} else if (arg1.pos instanceof RoomPosition) {
			return { pos: arg1.pos, rest: [ arg2, ...rest ] as never };
		}
	}
	try {
		return {
			pos: new RoomPosition(arg1, arg2, fromRoom),
			rest,
		};
	} catch (err) {
		return {
			pos: undefined,
			rest,
		};
	}
}

export function fetchRoom(roomName: string) {
	const room = Game.rooms[roomName];
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (room === undefined) {
		throw new Error(`Could not access room ${roomName}`);
	}
	return room;
}
