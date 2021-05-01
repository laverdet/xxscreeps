import { getOrSet } from 'xxscreeps/utility/utility';

export const kMaxWorldSize = 0x100;
const kMaxWorldSize2 = kMaxWorldSize >>> 1;

const roomNames = new Map<number, string>();

export function generateRoomName(xx: number, yy: number) {
	return getOrSet(roomNames,
		yy << 8 | xx,
		() => generateRoomNameFromId(yy << 8 | xx));
}

export function generateRoomNameFromId(id: number) {
	return getOrSet(roomNames, id, () => {
		const rx = (id & 0xff) - kMaxWorldSize2;
		const ry = (id >>> 8) - kMaxWorldSize2;
		return generateRoomNameFromXY(rx, ry);
	});
}

function generateRoomNameFromXY(xx: number, yy: number) {
	return (
		(xx < 0 ? `W${-xx - 1}` : `E${xx}`) +
		(yy < 0 ? `N${-yy - 1}` : `S${yy}`)
	);
}

export function parseRoomName(name: string) {
	// Parse X and calculate str position of Y
	const rx = parseInt(name.substr(1), 10);
	let verticalPos = 2;
	if (rx >= 100) {
		verticalPos = 4;
	} else if (rx >= 10) {
		verticalPos = 3;
	}
	// Parse Y and return adjusted coordinates
	const ry = parseInt(name.substr(verticalPos + 1), 10);
	const horizontalDir = name.charAt(0);
	const verticalDir = name.charAt(verticalPos);
	return {
		rx: horizontalDir === 'W' || horizontalDir === 'w' ?
			kMaxWorldSize2 - rx - 1 :
			kMaxWorldSize2 + rx,
		ry: verticalDir === 'N' || verticalDir === 'n' ?
			kMaxWorldSize2 - ry - 1 :
			kMaxWorldSize2 + ry,
	};
}

export function parseRoomNameToId(name: string) {
	const { rx, ry } = parseRoomName(name);
	return ry << 8 | rx;
}
