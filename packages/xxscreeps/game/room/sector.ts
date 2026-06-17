import { makeSignedRoomName, parseSignedRoomName } from './name.js';

// Sector centers are the rooms numbered `…5` on each axis; the highway ring sits on the `…0`
// boundary rooms ±5 away. Keyed off the sign of the signed coordinate (W/N use the negative
// residue) so the test holds at any world size rather than a fixed half-world offset.
function isCentralAxis(coord: number): boolean {
	return coord < 0 ? coord % 10 === -6 : coord % 10 === 5;
}

function isCentralCoord(rx: number, ry: number): boolean {
	return isCentralAxis(rx) && isCentralAxis(ry);
}

export function isCentralRoom(roomName: string): boolean {
	const { rx, ry } = parseSignedRoomName(roomName);
	return isCentralCoord(rx, ry);
}

// 11-room ring around a sector center: 4 corners + 9 rooms per side = 40 rooms total. Emission
// order is load-bearing (deposit placement consumes it), so corners precede the interleaved sides.
export function *sectorEdgeRooms(centralRoom: string): Iterable<string> {
	const { rx, ry } = parseSignedRoomName(centralRoom);
	if (!isCentralCoord(rx, ry)) {
		return;
	}
	yield makeSignedRoomName(rx - 5, ry - 5);
	yield makeSignedRoomName(rx + 5, ry - 5);
	yield makeSignedRoomName(rx - 5, ry + 5);
	yield makeSignedRoomName(rx + 5, ry + 5);
	for (let ii = -4; ii <= 4; ++ii) {
		yield makeSignedRoomName(rx + ii, ry - 5);
		yield makeSignedRoomName(rx + ii, ry + 5);
		yield makeSignedRoomName(rx - 5, ry + ii);
		yield makeSignedRoomName(rx + 5, ry + ii);
	}
}

// Inverse: which centers claim this room as a ring member. Edge rooms belong to 1-2 sectors;
// corner rooms to 4. Centers and interior rooms yield nothing.
export function *sectorsForRoom(roomName: string): Iterable<string> {
	const { rx, ry } = parseSignedRoomName(roomName);
	for (let dx = -5; dx <= 5; ++dx) {
		if (!isCentralAxis(rx + dx)) {
			continue;
		}
		for (let dy = -5; dy <= 5; ++dy) {
			if (!isCentralAxis(ry + dy)) {
				continue;
			}
			// Ring member iff exactly 5 from the center on at least one axis; the offset is `dx`/`dy`.
			if (Math.abs(dx) === 5 || Math.abs(dy) === 5) {
				yield makeSignedRoomName(rx + dx, ry + dy);
			}
		}
	}
}

const SECTOR_HALF_EXTENT = 250;

// `roomName` must be a highway ring member of `centralRoom` (see `sectorsForRoom`). Returns a
// position predicate for the sector's 250-tile radius. The radius only clips boundary rooms: a
// room whose extent on an axis stays within the radius is wholly inside on that axis, and one
// inside on both axes needs no test at all.
export function makeSectorRadiusFilter(centralRoom: string, roomName: string): (xx: number, yy: number) => boolean {
	const center = parseSignedRoomName(centralRoom);
	const here = parseSignedRoomName(roomName);
	const xBase = (here.rx - center.rx) * 50 - 24;
	const yBase = (here.ry - center.ry) * 50 - 24;
	const xInside = Math.max(Math.abs(xBase), Math.abs(xBase + 49)) < SECTOR_HALF_EXTENT;
	const yInside = Math.max(Math.abs(yBase), Math.abs(yBase + 49)) < SECTOR_HALF_EXTENT;
	if (xInside && yInside) {
		return () => true;
	} else if (xInside) {
		return (_xx, yy) => Math.abs(yBase + yy) < SECTOR_HALF_EXTENT;
	} else if (yInside) {
		return xx => Math.abs(xBase + xx) < SECTOR_HALF_EXTENT;
	} else {
		return (xx, yy) => Math.abs(xBase + xx) < SECTOR_HALF_EXTENT && Math.abs(yBase + yy) < SECTOR_HALF_EXTENT;
	}
}
