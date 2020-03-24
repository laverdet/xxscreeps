import * as PathFinder from '~/driver/pathfinder';
import * as C from '~/engine/game/constants';
import { checkCast, withType, BufferView, Format, Interceptor } from '~/engine/schema';
import { firstMatching } from '~/lib/utility';
import { RoomObject } from './objects/room-object';

export const format = withType<RoomPosition>(checkCast<Format>()({
	position: 'int32',
}));

const kMaxWorldSize = 0x100;
const kMaxWorldSize2 = kMaxWorldSize >>> 1;

const roomNames = new Map<number, string>();
export function generateRoomName(posBits: number) {
	// Check cache
	let roomName = roomNames.get(posBits);
	if (roomName !== undefined) {
		return roomName;
	}
	// Need to generate the room name
	const xx = (posBits & 0xff) - kMaxWorldSize2;
	const yy = (posBits >>> 8) - kMaxWorldSize2;
	roomName =
		(xx < 0 ? `W${-xx - 1}` : `E${xx}`) +
		(yy < 0 ? `N${-yy - 1}` : `S${yy}`);
	roomNames.set(posBits, roomName);
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

function fetchArguments(arg1?: any, arg2?: any, arg3?: any) {
	if (typeof arg1 === 'object') {
		const int = arg1[PositionInteger] ?? arg1?.pos?.[PositionInteger];
		if (int !== undefined) {
			return {
				xx: (int >>> 16) & 0xff,
				yy: (int >>> 24) & 0xff,
				room: int & 0xffff,
				extra: arg2,
			};
		}
	}
	return {
		xx: arg1 as number,
		yy: arg2 as number,
		room: 0,
		extra: arg3,
	};
}

export const PositionInteger: unique symbol = Symbol('positionInteger');

/**
 * An object representing the specified position in the room. Every `RoomObject` in a room contains
 * a `RoomPosition` as the `pos` property. A position object for a custom location can be obtained
 * using the `Room.getPositionAt` method or using the constructor.
 */
export class RoomPosition {
	[PositionInteger]!: number;

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
		return generateRoomName(this[PositionInteger] & 0xffff);
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

	/**
	 * Get linear range to the specified position
	 */
	getRangeTo(x: number, y: number): number;
	getRangeTo(pos: RoomObject | RoomPosition): number;
	getRangeTo(...args: any) {
		const { xx, yy, room } = fetchArguments(...args);
		if (room !== 0 && (this[PositionInteger] & 0xffff) !== room) {
			return Infinity;
		}
		return Math.max(Math.abs(this.x - xx), Math.abs(this.y - yy));
	}

	/**
	 * Check whether this position is on the adjacent square to the specified position. The same as
	 * `position.inRangeTo(target, 1)`
	 */
	isNearTo(x: number, y: number): boolean;
	isNearTo(pos: RoomObject | RoomPosition): boolean;
	isNearTo(...args: [any]) {
		return this.getRangeTo(...args) <= 1;
	}

	inRangeTo(x: number, y: number, range: number): boolean;
	inRangeTo(pos: RoomObject | RoomPosition, range: number): boolean;
	inRangeTo(...args: [any]) {
		const { xx, yy, room, extra } = fetchArguments(...args);
		if (room !== 0 && (this[PositionInteger] & 0xffff) !== room) {
			return false;
		}
		const range = Math.max(Math.abs(this.x - xx), Math.abs(this.y - yy));
		return range <= extra;
	}

	findClosestByPath(type: number) {

		// Get this room
		const room = Game.rooms[this.roomName];
		if (room === undefined) {
			throw new Error(`Could not access room ${this.roomName}`);
		}

		// Find objects to search
		const objects = room.find(type);
		const goals = objects.map(({ pos }) => ({ pos, range: 1 }));

		// Invoke pathfinder
		const path = PathFinder.search(this, goals);
		if (path.incomplete) {
			return;
		}
		const last = path.path[path.path.length - 1];

		// Match position to object
		return firstMatching(objects, object => object.pos.isNearTo(last));
	}

	toJSON() {
		return { x: this.x, y: this.y, roomName: this.roomName };
	}

	toString() {
		return `[room ${this.roomName} pos ${this.x},${this.y}]`;
	}
}

export function getPositonInDirection(position: RoomPosition, direction: number) {
	const { x, y, roomName } = position;
	switch (direction) {
		case C.TOP: return new RoomPosition(x, y - 1, roomName);
		case C.TOP_RIGHT: return new RoomPosition(x + 1, y - 1, roomName);
		case C.RIGHT: return new RoomPosition(x + 1, y, roomName);
		case C.BOTTOM_RIGHT: return new RoomPosition(x + 1, y + 1, roomName);
		case C.BOTTOM: return new RoomPosition(x, y + 1, roomName);
		case C.BOTTOM_LEFT: return new RoomPosition(x - 1, y + 1, roomName);
		case C.LEFT: return new RoomPosition(x - 1, y, roomName);
		case C.TOP_LEFT: return new RoomPosition(x - 1, y - 1, roomName);
		default: throw new Error('Invalid direction');
	}
}

export const interceptors = {
	RoomPosition: checkCast<Interceptor>()({
		composeFromBuffer: (view: BufferView, offset: number) =>
			new (RoomPosition as any)(view.int32[offset >>> 2]) as RoomPosition,
		decomposeIntoBuffer: (value: any, view: BufferView, offset: number) =>
			((view.int32[offset >>> 2] = value[PositionInteger], 4)),
	}),
};

export const schemaFormat = { RoomPosition: format };
