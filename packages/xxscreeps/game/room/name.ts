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
	return makeSignedRoomName(rx - kMaxWorldSize2, ry - kMaxWorldSize2);
}

// Signed room coordinates: W/N are negative (W0 = -1 … W127 = -128), E/S non-negative
// (E0 = 0 … E127 = 127). The int8 range "pays for" the missing 0 on the W/N side, so the world
// spans W127N127 … E127S127 with no half-world offset — the offset-free primitive geometry math
// can build on without baking in a 256x256 world bound.
export function makeSignedRoomName(rx: number, ry: number) {
	return (rx < 0 ? `W${-1 - rx}` : `E${rx}`) + (ry < 0 ? `N${-1 - ry}` : `S${ry}`);
}

export function parseSignedRoomName(name: string) {
	// Parse X and calculate str position of Y
	const rx = parseInt(name.slice(1), 10);
	let verticalPos = 2;
	if (rx >= 100) {
		verticalPos = 4;
	} else if (rx >= 10) {
		verticalPos = 3;
	}
	// Parse Y and return signed coordinates
	const ry = parseInt(name.slice(verticalPos + 1), 10);
	const horizontalDir = name.charAt(0);
	const verticalDir = name.charAt(verticalPos);
	return {
		rx: horizontalDir === 'W' || horizontalDir === 'w' ? -1 - rx : rx,
		ry: verticalDir === 'N' || verticalDir === 'n' ? -1 - ry : ry,
	};
}

export function parseRoomName(name: string) {
	const { rx, ry } = parseSignedRoomName(name);
	return { rx: kMaxWorldSize2 + rx, ry: kMaxWorldSize2 + ry };
}

export function parseRoomNameToId(name: string) {
	const { rx, ry } = parseRoomName(name);
	return roomIdFromCoordinates(rx, ry);
}

function roomIdFromCoordinates(rx: number, ry: number) {
	return (ry << 8) | rx;
}
