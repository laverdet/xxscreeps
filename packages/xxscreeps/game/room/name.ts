import { getOrSet } from 'xxscreeps/utility/utility.js';

export const kMaxWorldSize = 0x100;
const kMaxWorldSize2 = kMaxWorldSize >>> 1;

const roomNames = new Map<number, string>();

export function makeRoomName(rx: number, ry: number) {
	const id = roomIdFromCoordinates(rx, ry);
	return getOrSet(roomNames, id, () => makeRoomNameFromXY(rx, ry));
}

export function makeRoomNameFromId(id: number) {
	return getOrSet(roomNames, id, () => {
		const rx = id & 0xff;
		const ry = id >>> 8;
		return makeRoomNameFromXY(rx, ry);
	});
}

function makeRoomNameFromXY(rx: number, ry: number) {
	return (
		(rx < kMaxWorldSize2 ? `W${kMaxWorldSize2 - 1 - rx}` : `E${rx - kMaxWorldSize2}`) +
		(ry < kMaxWorldSize2 ? `N${kMaxWorldSize2 - 1 - ry}` : `S${ry - kMaxWorldSize2}`)
	);
}

export function parseRoomName(name: string) {
	// Parse X and calculate str position of Y
	const rx = parseInt(name.slice(1), 10);
	let verticalPos = 2;
	if (rx >= 100) {
		verticalPos = 4;
	} else if (rx >= 10) {
		verticalPos = 3;
	}
	// Parse Y and return adjusted coordinates
	const ry = parseInt(name.slice(verticalPos + 1), 10);
	const horizontalDir = name.charAt(0);
	const verticalDir = name.charAt(verticalPos);
	return {
		rx: kMaxWorldSize2 + (horizontalDir === 'W' || horizontalDir === 'w' ? -1 - rx : rx),
		ry: kMaxWorldSize2 + (verticalDir === 'N' || verticalDir === 'n' ? -1 - ry : ry),
	};
}

export function parseRoomNameToId(name: string) {
	const { rx, ry } = parseRoomName(name);
	return roomIdFromCoordinates(rx, ry);
}

function roomIdFromCoordinates(rx: number, ry: number) {
	return (ry << 8) | rx;
}
