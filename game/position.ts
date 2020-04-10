import type { InspectOptionsStylized } from 'util';
import { iteratee } from '~/engine/util/iteratee';
import * as PathFinder from '~/game/path-finder';
import * as C from '~/game/constants';
import * as Game from '~/game/game';
import type { ConstructibleStructureType } from '~/game/objects/construction-site';
import { firstMatching, minimum } from '~/lib/utility';
import type { RoomObject } from './objects/room-object';
import { FindConstants, FindPathOptions, RoomFindType, RoomFindOptions } from './room';

const kMaxWorldSize = 0x100;
const kMaxWorldSize2 = kMaxWorldSize >>> 1;
const ALL_DIRECTIONS = [
	C.TOP, C.TOP_RIGHT, C.RIGHT, C.BOTTOM_RIGHT, C.BOTTOM, C.BOTTOM_LEFT, C.LEFT, C.TOP_LEFT,
];
export type Direction = typeof ALL_DIRECTIONS[number];
type FindClosestByPathOptions = RoomFindOptions & Omit<PathFinder.RoomSearchOptions, 'range'>;

export const PositionInteger: unique symbol = Symbol('positionInteger');
type PositionFindType<Type> =
	Type extends RoomObject[] ? Type :
	Type extends RoomPosition ? RoomPosition :
	Type extends FindConstants ? RoomFindType<Type> :
	never;

/**
 * An object representing the specified position in the room. Every `RoomObject` in a room contains
 * a `RoomPosition` as the `pos` property. A position object for a custom location can be obtained
 * using the `Room.getPositionAt` method or using the constructor.
 */
export class RoomPosition {
	/**
	 * You can create new RoomPosition object using its constructor.
	 * @param xx X position in the room.
	 * @param yy Y position in the room.
	 * @param roomName The room name.
	 */
	constructor(bits: number);
	constructor(xx: number, yy: number, roomName: string);
	constructor(...args: any[]) {
		if (args.length === 1) {
			this[PositionInteger] = args[0] >>> 0;
		} else if (args.length === 3) {
			const [ xx, yy ] = args;
			const [ rx, ry ] = parseRoomName(args[2]);
			if (
				!(rx >= 0 && rx < kMaxWorldSize) ||
				!(ry >= 0 && ry < kMaxWorldSize) ||
				!(xx >= 0 && xx < 50) ||
				!(yy >= 0 && yy < 50)
			) {
				throw new TypeError('Invalid arguments in `RoomPosition` constructor');
			}
			this[PositionInteger] = yy << 24 | xx << 16 | ry << 8 | rx;
		} else {
			this[PositionInteger] = 0;
		}
	}

	/**
	 * The name of the room.
	 */
	 get roomName() {
		return generateRoomNameFromId(this[PositionInteger] & 0xffff);
	}
	set roomName(roomName: string) {
		const [ rx, ry ] = parseRoomName(roomName);
		if (
			!(rx >= 0 && rx < kMaxWorldSize) ||
			!(ry >= 0 && ry < kMaxWorldSize)
		) {
			throw new TypeError('Invalid `roomName`');
		}
		this[PositionInteger] = this[PositionInteger] & ~0xffff | ry << 8 | rx;
	}

	/**
	 * X position in the room.
	 */
	get x() {
		return (this[PositionInteger] >>> 16) & 0xff;
	}
	set x(xx: number) {
		if (!(xx >= 0 && xx < 50)) {
			throw new TypeError('Invalid `x`');
		}
		this[PositionInteger] = this[PositionInteger] & ~(0xff << 16) | xx << 16;
	}

	/**
	 * Y position in the room.
	 */
	get y() {
		return this[PositionInteger] >>> 24;
	}
	set y(yy: number) {
		if (!(yy >= 0 && yy < 50)) {
			throw new TypeError('Invalid `y`');
		}
		this[PositionInteger] = this[PositionInteger] & ~(0xff << 24) | yy << 24;
	}

	getDirectionTo(x: number, y: number): Direction;
	getDirectionTo(pos: RoomObject | RoomPosition): Direction;
	getDirectionTo(...args: [ number, number ] | [ RoomObject | RoomPosition ]) {
		const { xx, yy, room } = fetchArguments(...args);
		if ((this[PositionInteger] & 0xffff) === room) {
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
		if (room !== 0 && (this[PositionInteger] & 0xffff) !== room) {
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
		return this[PositionInteger] === pos?.[PositionInteger];
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
		if (room !== 0 && (this[PositionInteger] & 0xffff) !== room) {
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
		search: Type, options?: FindClosestByPathOptions
	): PositionFindType<Type> | undefined;
	findClosestByPath(
		search: FindConstants | (RoomObject | RoomPosition)[],
		options: FindClosestByPathOptions = {},
	): RoomObject | RoomPosition | undefined {

		// Find objects to search
		const objects = typeof search === 'number' ?
			fetchRoom(this.roomName).find(search) : search;
		const filtered = options?.filter === undefined ? objects :
			objects.filter(iteratee(options.filter));
		const goals = filtered.map(object => 'pos' in object ? object.pos : object);

		// Invoke pathfinder
		const result = PathFinder.roomSearch(this, goals, { ...options, maxRooms: 1 });
		if (result.incomplete) {
			return;
		}

		// Match position to object
		const { path } = result;
		const last = path[path.length - 1] ?? this;
		return firstMatching(filtered, object => last.isNearTo(object));
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
	): PositionFindType<Type> | undefined;
	findClosestByRange(
		search: FindConstants | (RoomObject | RoomPosition)[], options?: RoomFindOptions,
	) {

		// Find objects to search
		const objects = typeof search === 'number' ?
			fetchRoom(this.roomName).find(search) : search;
		const filtered = options?.filter === undefined ? objects :
			objects.filter(iteratee(options.filter));
		return minimum(filtered, (left, right) =>
			this.getRangeTo(left) - this.getRangeTo(right));
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
		range: FindConstants,
		options?: RoomFindOptions<PositionFindType<Type>>,
	): PositionFindType<Type>[] | undefined;
	findInRange(
		search: FindConstants | RoomObject[] | RoomPosition[],
		range: number,
		options?: FindClosestByPathOptions,
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
	findPathTo(x: number, y: number, options?: FindPathOptions): any;
	findPathTo(target: RoomObject | RoomPosition, options?: FindPathOptions): any;
	findPathTo(...args: any) {
		const { pos, extra } = fetchPositionArgument(this.roomName, ...args);
		return fetchRoom(this.roomName).findPath(this, pos!, extra);
	}

	lookFor() {
	}

	/**
	 * Create new `ConstructionSite` at the specified location.
	 * @param structureType One of the `STRUCTURE_*` constants.
	 * @param name The name of the structure, for structures that support it (currently only spawns).
	 */
	createConstructionSite(structureType: ConstructibleStructureType, name?: string) {
		return fetchRoom(this.roomName).createConstructionSite(this, structureType, name);
	}

	createFlag(/*name: string*/) {
		(globalThis as any).Memory.flags = {};
	}

	toJSON() {
		return { x: this.x, y: this.y, roomName: this.roomName };
	}

	toString() {
		return `[room ${this.roomName} pos ${this.x},${this.y}]`;
	}

	[Symbol.for('nodejs.util.inspect.custom')](depth: number, { stylize }: InspectOptionsStylized) {
		return `[RoomPosition ${stylize(this.roomName, 'string')} {${stylize(`${this.x}`, 'number')}, ${stylize(`${this.y}`, 'number')}}]`;
	}

	[PositionInteger]: number;
}

//
// Function argument handlers
export function fetchArguments(arg1?: any, arg2?: any, arg3?: any, ...rest: any) {
	if (typeof arg1 === 'object') {
		const int = arg1[PositionInteger] ?? arg1?.pos?.[PositionInteger];
		if (int !== undefined) {
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

export function fetchPositionArgument(
	fromRoom: string, arg1?: any, arg2?: any, arg3?: any,
): { pos?: RoomPosition; extra: any } {
	if (typeof arg1 === 'object') {
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

function fetchRoom(roomName: string) {
	const room = Game.rooms[roomName];
	if (room === undefined) {
		throw new Error(`Could not access room ${roomName}`);
	}
	return room;
}

//
// Directional utilities
function getDirection(dx: number, dy: number): Direction;
function getDirection(dx: number, dy: number) {
	const adx = Math.abs(dx);
	const ady = Math.abs(dy);
	if (adx > ady * 2) {
		if (dx > 0) {
			return C.RIGHT;
		} else {
			return C.LEFT;
		}
	} else if (ady > adx * 2) {
		if (dy > 0) {
			return C.BOTTOM;
		} else {
			return C.TOP;
		}
	} else if (dx > 0) {
		if (dy > 0) {
			return C.BOTTOM_RIGHT;
		} else if (dy < 0) {
			return C.TOP_RIGHT;
		}
	} else if (dx < 0) {
		if (dy > 0) {
			return C.BOTTOM_LEFT;
		} else if (dy < 0) {
			return C.TOP_LEFT;
		}
	}
}

export function getOffsetsFromDirection(direction: Direction) {
	switch (direction) {
		case C.TOP: return { dx: 0, dy: -1 };
		case C.TOP_RIGHT: return { dx: 1, dy: -1 };
		case C.RIGHT: return { dx: 1, dy: 0 };
		case C.BOTTOM_RIGHT: return { dx: 1, dy: 1 };
		case C.BOTTOM: return { dx: 0, dy: 1 };
		case C.BOTTOM_LEFT: return { dx: -1, dy: 1 };
		case C.LEFT: return { dx: -1, dy: 0 };
		case C.TOP_LEFT: return { dx: -1, dy: -1 };
		default: throw new Error('Invalid direction');
	}
}

export function getPositonInDirection(position: RoomPosition, direction: Direction) {
	const { x, y, roomName } = position;
	const { dx, dy } = getOffsetsFromDirection(direction);
	return new RoomPosition(x + dx, y + dy, roomName);
}

export function iterateNeighbors(position: RoomPosition) {
	return function *() {
		const { x, y, roomName } = position;
		for (const direction of ALL_DIRECTIONS) {
			const { dx, dy } = getOffsetsFromDirection(direction);
			const posX = x + dx;
			const posY = y + dy;
			if (posX >= 0 && posX < 50 && posY >= 0 && posY < 50) {
				yield new RoomPosition(posX, posY, roomName);
			}
		}
	}();
}

//
// Room name parsing
export function generateRoomName(xx: number, yy: number) {
	return generateRoomNameFromId(yy << 8 | xx);
}

const roomNames = new Map<number, string>();
export function generateRoomNameFromId(id: number) {
	// Check cache
	let roomName = roomNames.get(id);
	if (roomName !== undefined) {
		return roomName;
	}
	// Need to generate the room name
	const xx = (id & 0xff) - kMaxWorldSize2;
	const yy = (id >>> 8) - kMaxWorldSize2;
	roomName =
		(xx < 0 ? `W${-xx - 1}` : `E${xx}`) +
		(yy < 0 ? `N${-yy - 1}` : `S${yy}`);
	roomNames.set(id, roomName);
	return roomName;
}

export function parseRoomName(name: string): [ number, number ] {
	// Parse X and calculate str position of Y
	const xx = parseInt(name.substr(1), 10);
	let verticalPos = 2;
	if (xx >= 100) {
		verticalPos = 4;
	} else if (xx >= 10) {
		verticalPos = 3;
	}
	// Parse Y and return adjusted coordinates
	const yy = parseInt(name.substr(verticalPos + 1), 10);
	const horizontalDir = name.charAt(0);
	const verticalDir = name.charAt(verticalPos);
	return [
		(horizontalDir === 'W' || horizontalDir === 'w') ?
			kMaxWorldSize2 - xx - 1 :
			kMaxWorldSize2 + xx,
		(verticalDir === 'N' || verticalDir === 'n') ?
			kMaxWorldSize2 - yy - 1 :
			kMaxWorldSize2 + yy,
	];
}

export function parseRoomNameToId(name: string) {
	const [ xx, yy ] = parseRoomName(name);
	return yy << 8 | xx;
}
