import type { Direction } from './direction.js';
import type { RoomObject } from './object.js';
import type { FindConstants, FindType, RoomFindOptions } from './room/find.js';
import type { LookConstants } from './room/look.js';
import type { FindPathOptions, RoomPath } from './room/path.js';
import type { InspectOptionsStylized } from 'node:util';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as PathFinder from 'xxscreeps/game/pathfinder/index.js';
import { iteratee } from 'xxscreeps/utility/lodash.js';
import { getDirection, getOffsetsFromDirection, makeAbstractIterateWithRangeTo, makeLocalIterateArea, makeLocalIterateInRangeTo } from './direction.js';
import { kMaxWorldSize, makeRoomNameFromId, parseRoomName } from './room/name.js';
import { Game, registerGlobal } from './index.js';

export type { Direction } from './direction.js';
export { isBorder, isNearBorder } from './terrain.js';

type FindClosestByPathOptions<Type> =
	RoomFindOptions<Type> & Omit<PathFinder.RoomSearchOptions, 'range'>;

type PositionFindType<Type> =
	Type extends (infer Result)[] ? Result :
	Type extends FindConstants ? FindType<Type> :
	never;

export const kRoomSize = 50;
export const kMaxRoomCoordinate = kRoomSize - 1;

export type PositionParameter = [ position: RoomPosition ] | [ target: RoomObject ] | [ x: number, y: number ];

export interface LocalPosition {
	x: number;
	y: number;
}

export interface PositionLike extends LocalPosition {
	['#id']?: undefined;
	['#rx']?: undefined;
	['#ry']?: undefined;
	roomName: string;
}

const RawPositionId = Symbol('defaultRoomPosition');

/**
 * An object representing the specified position in the room. Every `RoomObject` in the room
 * contains `RoomPosition` as the `pos` property. The position object of a custom location can be
 * obtained using the [`Room.getPositionAt`](https://docs.screeps.com/api/#Room.getPositionAt)
 * method or using the constructor.
 * @public
 * @see https://docs.screeps.com/api/#RoomPosition
 */
export class RoomPosition {
	declare private '#id': number;

	/** @internal */
	constructor(xx: typeof RawPositionId, id: number, roomName?: unknown);

	/**
	 * You can create new `RoomPosition` object using its constructor.
	 * @param xx X position in the room.
	 * @param yy Y position in the room.
	 * @param roomName The room name.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.constructor
	 */
	constructor(xx: number, yy: number, roomName: string);

	constructor(xx: number | typeof RawPositionId, yy: number, roomName: string) {
		if (xx === RawPositionId) {
			this['#id'] = yy;
		} else {
			const { rx, ry } = parseRoomName(roomName);
			if (
				!(rx >= 0 && rx < kMaxWorldSize) ||
				!(ry >= 0 && ry < kMaxWorldSize) ||
				!(xx >= 0 && xx <= kMaxRoomCoordinate) ||
				!(yy >= 0 && yy <= kMaxRoomCoordinate)
			) {
				throw new TypeError('Invalid arguments in `RoomPosition` constructor');
			}
			this['#id'] = (yy << 24) | (xx << 16) | (ry << 8) | rx;
		}
	}

	/**
	 * The name of the room.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.roomName
	 */
	@enumerable get roomName() {
		return makeRoomNameFromId(this['#id'] & 0xffff);
	}

	/**
	 * X position in the room.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.x
	 */
	// eslint-disable-next-line id-length
	@enumerable get x() {
		return (this['#id'] >>> 16) & 0xff;
	}

	/**
	 * Y position in the room.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.y
	 */
	// eslint-disable-next-line id-length
	@enumerable get y() {
		return this['#id'] >>> 24;
	}

	/** @deprecated */
	get __packedPos() {
		const id = this['#id'];
		return ((id & 0xffff) << 16) | ((id >>> 8) & 0xff00) | (id >>> 24);
	}

	get '#rx'() {
		return this['#id'] & 0xff;
	}

	get '#ry'() {
		return (this['#id'] >>> 8) & 0xff;
	}

	/** @deprecated */
	set __packedPos(value: number) {
		this['#id'] = ((value & 0xff) << 24) | ((value & 0xff00) << 8) | ((value >>> 16) & 0xffff);
	}

	// eslint-disable-next-line id-length
	set x(xx: number) {
		if (!(xx >= 0 && xx <= kMaxRoomCoordinate)) {
			throw new TypeError('Invalid `x`');
		}
		this['#id'] = (this['#id'] & ~(0xff << 16)) | (xx << 16);
	}

	// eslint-disable-next-line id-length
	set y(yy: number) {
		if (!(yy >= 0 && yy <= kMaxRoomCoordinate)) {
			throw new TypeError('Invalid `y`');
		}
		this['#id'] = (this['#id'] & ~(0xff << 24)) | (yy << 24);
	}

	set roomName(roomName: string) {
		const { rx, ry } = parseRoomName(roomName);
		if (
			!(rx >= 0 && rx < kMaxWorldSize) ||
			!(ry >= 0 && ry < kMaxWorldSize)
		) {
			throw new TypeError('Invalid `roomName`');
		}
		this['#id'] = (this['#id'] & ~0xffff) | (ry << 8) | rx;
	}

	static '#create'(pos: number) {
		return new RoomPosition(RawPositionId, pos);
	}

	/**
	 * Get linear direction to the specified position.
	 * @param x X position in the room.
	 * @param y Y position in the room.
	 * @param pos Can be a `RoomPosition` object or any object containing `RoomPosition`.
	 * @returns A number representing one of the direction constants.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.getDirectionTo
	 */
	getDirectionTo(x: number, y: number): Direction;
	getDirectionTo(pos: RoomObject | RoomPosition): Direction;
	getDirectionTo(...args: [number, number] | [RoomObject | RoomPosition]) {
		const { pos } = fetchPositionArgument(this.roomName, args);
		if (!pos) return undefined;

		return getDirection(
			pos['#rx'] * kRoomSize + pos.x - this['#rx'] * kRoomSize - this.x,
			pos['#ry'] * kRoomSize + pos.y - this['#ry'] * kRoomSize - this.y,
		);
	}

	/**
	 * Get linear range to the specified position.
	 * @param x X position in the room.
	 * @param y Y position in the room.
	 * @param target Can be a `RoomPosition` object or any object containing `RoomPosition`.
	 * @returns A number of squares to the given position.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.getRangeTo
	 */
	getRangeTo(x: number, y: number): number;
	getRangeTo(target: RoomObject | RoomPosition): number;
	getRangeTo(...args: [ number, number ] | [ RoomObject | RoomPosition ]) {
		const { xx, yy, room } = fetchArguments(args);
		if (room !== 0 && (this['#id'] & 0xffff) !== room) {
			return Infinity;
		}
		return Math.max(Math.abs(this.x - xx), Math.abs(this.y - yy));
	}

	/**
	 * Check whether this position is the same as the specified position.
	 * @param x X position in the room.
	 * @param y Y position in the room.
	 * @param target Can be a `RoomPosition` object or any object containing `RoomPosition`.
	 * @returns A boolean value.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.isEqualTo
	 */
	isEqualTo(x: number, y: number): boolean;
	isEqualTo(target: RoomObject | RoomPosition): boolean;
	isEqualTo(...args: [ number, number ] | [ RoomObject | RoomPosition ]) {
		const { pos } = fetchPositionArgument(this.roomName, args);
		return this['#id'] === (pos ? pos['#id'] : 0);
	}

	/**
	 * Check whether this position is on the adjacent square to the specified position. The same as
	 * `inRangeTo(target, 1)`.
	 * @param x X position in the room.
	 * @param y Y position in the room.
	 * @param target Can be a `RoomPosition` object or any object containing `RoomPosition`.
	 * @returns A boolean value.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.isNearTo
	 */
	isNearTo(x: number, y: number): boolean;
	isNearTo(target: RoomObject | RoomPosition): boolean;
	isNearTo(...args: unknown[]) {
		return this.getRangeTo(...args as [ number, number ]) <= 1;
	}

	/**
	 * Check whether this position is in the given range of another position.
	 * @param x X position in the same room.
	 * @param y Y position in the same room.
	 * @param target The target position.
	 * @param range The range distance.
	 * @returns A boolean value.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.inRangeTo
	 */
	inRangeTo(x: number, y: number, range: number): boolean;
	inRangeTo(target: RoomObject | RoomPosition, range: number): boolean;
	inRangeTo(...args: [ number, number, number ] | [ RoomObject | RoomPosition, number ]) {
		const { xx, yy, room, rest } = fetchArguments(args);
		if (room !== 0 && (this['#id'] & 0xffff) !== room) {
			return false;
		}
		const range = Math.max(Math.abs(this.x - xx), Math.abs(this.y - yy));
		return range <= rest[0];
	}

	/**
	 * Find an object with the shortest path from the given position. Uses
	 * [Jump Point Search algorithm](https://en.wikipedia.org/wiki/Jump_point_search) and
	 * [Dijkstra's algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm).
	 * @param search One of the `FIND_*` constants. See
	 * [Room.find](https://docs.screeps.com/api/#Room.find). Or: an array of room's objects or
	 * [RoomPosition](https://docs.screeps.com/api/#RoomPosition) objects that the search should be
	 * executed against.
	 * @param options An object containing pathfinding options (see
	 * [Room.findPath](https://docs.screeps.com/api/#Room.findPath)), or a `filter` property: only the
	 * objects which pass the filter using the [Lodash.filter](https://lodash.com/docs#filter) method
	 * will be used.
	 * @returns The closest object if found, null otherwise.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.findClosestByPath
	 */
	findClosestByPath<Type extends FindConstants | (RoomObject | RoomPosition)[]>(
		search: Type, options?: FindClosestByPathOptions<PositionFindType<Type>>
	): PositionFindType<Type> | null;
	findClosestByPath(
		search: FindConstants | (RoomObject | RoomPosition)[],
		options: FindClosestByPathOptions<any> = {},
	): RoomObject | RoomPosition | null {

		// Find objects to search
		const objects = typeof search === 'number'
			? fetchRoom(this.roomName).find(search) : search;
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
		const last = path.at(-1) ?? this;
		return Fn.find(filtered, object => last.isNearTo(object)) ?? null;
	}

	/**
	 * Find an object with the shortest linear distance from the given position.
	 * @param search One of the `FIND_*` constants. See
	 * [Room.find](https://docs.screeps.com/api/#Room.find). Or: an array of room's objects or
	 * [RoomPosition](https://docs.screeps.com/api/#RoomPosition) objects that the search should be
	 * executed against.
	 * @param options An object containing a `filter` property: only the objects which pass the filter
	 * using the [Lodash.filter](https://lodash.com/docs#filter) method will be used.
	 * @returns The closest object if found, null otherwise.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.findClosestByRange
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
		const objects = typeof search === 'number'
			? fetchRoom(this.roomName).find(search) : search;
		const filtered = options?.filter === undefined ? objects :
			objects.filter(iteratee(options.filter));
		return Fn.minimum(filtered, (left, right) =>
			this.getRangeTo(left) - this.getRangeTo(right)) ?? null;
	}

	/**
	 * Find all objects in the specified linear range.
	 * @param search One of the `FIND_*` constants. See
	 * [Room.find](https://docs.screeps.com/api/#Room.find). Or: an array of room's objects or
	 * [RoomPosition](https://docs.screeps.com/api/#RoomPosition) objects that the search should be
	 * executed against.
	 * @param range The range distance.
	 * @param options See [Room.find](https://docs.screeps.com/api/#Room.find).
	 * @returns An array with the objects found.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.findInRange
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
		const objects: (RoomObject | RoomPosition)[] = typeof search === 'number'
			? fetchRoom(this.roomName).find(search) : search;

		// Filter out in range & matching
		const inRange = objects.filter(object => this.inRangeTo(object, range));
		return options?.filter === undefined ? inRange :
			inRange.filter(iteratee(options.filter));
	}

	/**
	 * Find an optimal path to the specified position using
	 * [Jump Point Search algorithm](https://en.wikipedia.org/wiki/Jump_point_search). This method is
	 * a shorthand for [Room.findPath](https://docs.screeps.com/api/#Room.findPath). If the target is
	 * in another room, then the corresponding exit will be used as a target.
	 * @param x X position in the room.
	 * @param y Y position in the room.
	 * @param target Can be a `RoomPosition` object or any object containing `RoomPosition`.
	 * @param options An object containing pathfinding options flags (see
	 * [Room.findPath](https://docs.screeps.com/api/#Room.findPath) for more details).
	 * @returns An array with path steps in the following format:
	 * `[ { x: 10, y: 5, dx: 1, dy: 0, direction: RIGHT }, ... ]`
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.findPathTo
	 */
	findPathTo(x: number, y: number, options: FindPathOptions & { serialize?: false }): RoomPath;
	findPathTo(target: RoomObject | RoomPosition, options?: FindPathOptions & { serialize?: false }): RoomPath;
	findPathTo(x: number, y: number, options: FindPathOptions & { serialize: true }): string;
	findPathTo(target: RoomObject | RoomPosition, options: FindPathOptions & { serialize: true }): string;
	findPathTo(x: number, y: number, options: FindPathOptions): RoomPath | string;
	findPathTo(target: RoomObject | RoomPosition, options?: FindPathOptions): RoomPath | string;
	findPathTo(...args: unknown[]): RoomPath | string {
		type Rest = [ options?: FindPathOptions | undefined ];
		type Signature =
			[ xx: number, yy: number, ...Rest ] |
			[ target: RoomObject | RoomPosition, ...Rest ];
		const { pos, rest: [ options ] } = fetchPositionArgument(this.roomName, args as Signature);
		return fetchRoom(this.roomName).findPath(this, pos!, options);
	}

	/**
	 * Get an object with the given type at the specified room position.
	 * @param type One of the `LOOK_*` constants.
	 * @returns An array of objects of the given type at the specified position if found.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.lookFor
	 */
	lookFor(type: LookConstants) {
		return fetchRoom(this.roomName).lookForAt(type, this);
	}

	/**
	 * Get the list of objects at the specified room position.
	 * @returns An array with objects at the specified position in the following format: `[ { type:
	 * 'creep', creep: {...} }, { type: 'structure', structure: {...} }, ..., { type: 'terrain',
	 * terrain: 'swamp' } ]`
	 * @public
	 * @see https://docs.screeps.com/api/#RoomPosition.look
	 */
	look() {
		return fetchRoom(this.roomName).lookAt(this);
	}

	private toJSON() {
		return { x: this.x, y: this.y, roomName: this.roomName };
	}

	private toString() {
		return `[room ${this.roomName} pos ${this.x},${this.y}]`;
	}

	private [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptionsStylized) {
		// eslint-disable-next-line @typescript-eslint/unbound-method
		const { stylize } = options;
		return `[RoomPosition ${stylize(this.roomName, 'string')} {${stylize(`${this.x}`, 'number')}, ${stylize(`${this.y}`, 'number')}}]`;
	}
}

registerGlobal(RoomPosition);
declare module './runtime.js' {
	interface Global { RoomPosition: typeof RoomPosition }
}

//
// Function argument handlers
type PositionArgument = [ xx: number, yy: number ] | [ target: RoomObject | RoomPosition ];

type PositionArgumentRest<Args extends readonly unknown[]> =
	Args extends readonly [ number, number, ...infer Rest ]
		? Rest
		: Args extends readonly [ RoomObject | LocalPosition, ...infer Rest ]
			? Rest
			: never;

export function fetchArguments<Args extends [ ...PositionArgument, ...unknown[] ]>(args: Args): {
	xx: number;
	yy: number;
	room: number;
	rest: PositionArgumentRest<Args>;
};
export function fetchArguments(args: unknown[]) {
	const [ arg1 ] = args;
	if (typeof arg1 === 'object' && arg1 !== null) {
		type Arg = LocalPosition & { ['#id']?: number; pos?: RoomPosition };
		const target = arg1 as Arg;
		const int = target['#id'] ?? target.pos?.['#id'];
		const rest = args.slice(1);
		if (int === undefined) {
			return {
				xx: target.x,
				yy: target.y,
				room: 0,
				rest,
			};
		} else {
			return {
				xx: (int >>> 16) & 0xff,
				yy: (int >>> 24) & 0xff,
				room: int & 0xffff,
				rest,
			};
		}
	}
	const [ xx, yy, ...rest ] = args as [ number, number, ...unknown[] ];
	return { xx, yy, room: 0, rest };
}

export function fetchPositionArgument<Args extends [ ...PositionArgument, ...unknown[] ]>(fromRoom: string, args: Args): {
	pos: RoomPosition | undefined;
	rest: PositionArgumentRest<Args>;
};
export function fetchPositionArgument(fromRoom: string, args: unknown[]) {
	const [ arg1 ] = args;
	if (typeof arg1 === 'object' && arg1 !== null) {
		const pos = function() {
			if (arg1 instanceof RoomPosition) {
				return arg1;
			} else {
				const { pos } = arg1 as { pos?: unknown };
				if (pos instanceof RoomPosition) {
					return pos;
				}
			}
		}();
		return { pos, rest: args.slice(1) };
	} else {
		const [ xx, yy, ...rest ] = args as [ number, number, ...unknown[] ];
		try {
			return { pos: new RoomPosition(xx, yy, fromRoom), rest };
		} catch {
			return { pos: undefined, rest };
		}
	}
}

export function fetchRoom(roomName: string) {
	const room = Game.rooms[roomName];
	if (room === undefined) {
		throw new Error(`Could not access room ${roomName}`);
	}
	return room;
}

/**
 * Return the position from the given direction, or `undefined` if it would be invalid.
 */
export function getPositionInDirection(position: RoomPosition, direction: Direction) {
	const { x, y, roomName } = position;
	const { dx, dy } = getOffsetsFromDirection(direction);
	try {
		return new RoomPosition(x + dx, y + dy, roomName);
	} catch {}
}

/**
 * Iterate all positions within some range to the given position. It sweeps left to right, top to
 * bottom.
 */
export const iterateInRangeTo = function() {
	const iterate = makeLocalIterateInRangeTo(0, 49);
	return (origin: RoomPosition, range: number) =>
		iterateLocalPositions(iterate(origin.x, origin.y, range), origin.roomName);
}();

/**
 * Iterate the given rectangular area in a room.
 */
export const iterateArea = function() {
	const iterate = makeLocalIterateArea(0, 49);
	return (roomName: string, top: number, left: number, bottom: number, right: number) =>
		iterateLocalPositions(iterate(top, left, bottom, right), roomName);
}();

/**
 * Iterate all positions with exactly the range to the given position. It iterates clockwise
 * starting from top left.
 */
export const iterateWithRangeTo = function() {
	const iterate = makeAbstractIterateWithRangeTo(0, 49);
	return (origin: RoomPosition, range: number) =>
		iterateLocalPositions(iterate(origin.x, origin.y, range), origin.roomName);
}();

/**
 * Iterate all direct neighbors of the given position.
 */
export function iterateNeighbors(position: RoomPosition) {
	return iterateWithRangeTo(position, 1);
}

// Helper which translates a local position iterable to `RoomPosition`s
function *iterateLocalPositions(localPositions: Iterable<readonly [number, number]>, roomName: string) {
	for (const [ xx, yy ] of localPositions) {
		yield new RoomPosition(xx, yy, roomName);
	}
}
