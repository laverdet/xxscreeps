import * as C from 'xxscreeps/game/constants';
import { RoomPosition } from '.';

const ALL_DIRECTIONS = [
	C.TOP, C.TOP_RIGHT, C.RIGHT, C.BOTTOM_RIGHT, C.BOTTOM, C.BOTTOM_LEFT, C.LEFT, C.TOP_LEFT,
];
export type Direction = typeof ALL_DIRECTIONS[number];

export function getDirection(dx: number, dy: number): Direction;
export function getDirection(dx: number, dy: number) {
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
		case C.TOP: return { dx: 0, dy: -1 } as const;
		case C.TOP_RIGHT: return { dx: 1, dy: -1 } as const;
		case C.RIGHT: return { dx: 1, dy: 0 } as const;
		case C.BOTTOM_RIGHT: return { dx: 1, dy: 1 } as const;
		case C.BOTTOM: return { dx: 0, dy: 1 } as const;
		case C.BOTTOM_LEFT: return { dx: -1, dy: 1 } as const;
		case C.LEFT: return { dx: -1, dy: 0 } as const;
		case C.TOP_LEFT: return { dx: -1, dy: -1 } as const;
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
