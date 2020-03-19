import type { BufferView } from '~/engine/schema/buffer-view';
import type { Interceptors } from '~/engine/schema/interceptor';

export const format = {
	position: 'int32' as const,
};

const kMaxWorldSize = 0x100;
const kMaxWorldSize2 = kMaxWorldSize >>> 1;

const roomNames = new Map<number, string>();
function generateRoomName(posBits: number) {
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

function parseRoomName(name: string): [ number, number ] {
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

const PositionInteger: unique symbol = Symbol('positionInteger');

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

	toString() {
		return `[room ${this.roomName} pos ${this.x},${this.y}]`;
	}

	[Symbol.for('nodejs.util.inspect.custom')]() {
		return `${this}`;
	}
}

export const interceptors: Interceptors = {
	composeFromBuffer: (view: BufferView, offset: number) =>
		new (RoomPosition as any)(view.int32[offset >>> 2]),
	decomposeIntoBuffer: (value: any, view: BufferView, offset: number) =>
		((view.int32[offset >>> 2] = value[PositionInteger], 4)),
};
