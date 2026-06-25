import * as assert from 'node:assert/strict';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeAbstractIterateWithRangeTo } from 'xxscreeps/game/direction.js';
import { makeSignedRoomName, parseSignedRoomName } from './name.js';

// Sector centers are the rooms numbered `{..}5` on each axis; the highway ring sits on the `{..}0`
// boundary rooms +-5 away. Keyed off the sign of the signed coordinate (W/N use the negative
// residue) so the test holds at any world size rather than a fixed half-world offset.
function isCentralAxis(coord: number): boolean {
	return coord < 0 ? coord % 10 === -6 : coord % 10 === 5;
}

function isCentralCoord(rx: number, ry: number): boolean {
	return isCentralAxis(rx) && isCentralAxis(ry);
}

const iterateRoomCoordinatesWithRange = makeAbstractIterateWithRangeTo(-Infinity, Infinity);

export function isCentralRoom(roomName: string): boolean {
	const { rx, ry } = parseSignedRoomName(roomName);
	return isCentralCoord(rx, ry);
}

// A highway axis sits exactly 5 rooms from a sector-center axis (the `…0` boundary). Defined off
// `isCentralAxis` so the W/N sign phase-shift is handled in one place rather than re-derived.
function isHighwayAxis(coord: number): boolean {
	return isCentralAxis(coord - 5) || isCentralAxis(coord + 5);
}

// A highway room borders a sector on at least one axis — equivalently, `sectorsForRoom` is
// non-empty. Centers and interior rooms are not highways.
export function isHighwayRoom(roomName: string): boolean {
	const { rx, ry } = parseSignedRoomName(roomName);
	return isHighwayAxis(rx) || isHighwayAxis(ry);
}

// 11-room ring around a sector center: 4 corners + 9 rooms per side = 40 rooms total. Emission
// order is load-bearing (deposit placement consumes it), so corners precede the interleaved sides.
export function sectorEdgeRooms(centralRoom: string): Iterable<string> {
	const { rx, ry } = parseSignedRoomName(centralRoom);
	assert.ok(isCentralCoord(rx, ry));
	return Fn.map(iterateRoomCoordinatesWithRange(rx, ry, 5), ([ xx, yy ]) => makeSignedRoomName(xx, yy));
}

// Inverse: which centers claim this room as a ring member. Edge rooms belong to 1-2 sectors;
// corner rooms to 4. Centers and interior rooms yield nothing.
export function *sectorsForRoom(roomName: string): Iterable<string> {
	const { rx, ry } = parseSignedRoomName(roomName);
	for (const [ nx, ny ] of iterateRoomCoordinatesWithRange(rx, ry, 5)) {
		if (isCentralAxis(nx) && isCentralAxis(ny)) {
			yield makeSignedRoomName(nx, ny);
		}
	}
}

const SECTOR_HALF_EXTENT = 250;

// `roomName` must be a highway ring member of `centralRoom` (see `sectorsForRoom`). Returns a
// position predicate for the sector's 250-square radius. The radius only clips boundary rooms: a
// room whose extent on the central axis stays within the radius is wholly inside on that axis, and
// one inside on both axes needs no test at all.
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
		return (xx, yy) => Math.abs(yBase + yy) < SECTOR_HALF_EXTENT;
	} else if (yInside) {
		return xx => Math.abs(xBase + xx) < SECTOR_HALF_EXTENT;
	} else {
		return (xx, yy) => Math.abs(xBase + xx) < SECTOR_HALF_EXTENT && Math.abs(yBase + yy) < SECTOR_HALF_EXTENT;
	}
}
