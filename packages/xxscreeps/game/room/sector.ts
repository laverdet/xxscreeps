import { makeAbstractIterateWithRangeTo } from 'xxscreeps/game/direction.js';
import { makeSignedRoomName, parseSignedRoomName } from './name.js';

export type RoomType = 'normal' | 'highway' | 'sourceKeeper' | 'center';

// A room's authored geometry, stamped into the World schema: its classification in the sector
// template and the sector centers whose highway ring it sits on.
export interface RoomMeta {
	roomType: RoomType;
	centers: string[];
}

// Sector centers are the rooms numbered `{..}5` on each axis; the highway ring sits on the `{..}0`
// boundary rooms +-5 away. Keyed off the sign of the signed coordinate (W/N use the negative
// residue) so the test holds at any world size rather than a fixed half-world offset.
function isCentralAxis(coord: number): boolean {
	return coord < 0 ? coord % 10 === -6 : coord % 10 === 5;
}

// A highway axis sits exactly 5 rooms from a sector-center axis (the `…0` boundary). Defined off
// `isCentralAxis` so the W/N sign phase-shift is handled in one place rather than re-derived.
function isHighwayAxis(coord: number): boolean {
	return isCentralAxis(coord - 5) || isCentralAxis(coord + 5);
}

// The 3-wide central band of a sector — printed digits 4, 5, 6, sign-agnostic so W4 and E4 both
// yield 4. Both axes in-band marks the 3x3 sector core: the center plus its 8 source-keeper rooms.
function isCenterNineAxis(coord: number): boolean {
	const digit = (coord < 0 ? -1 - coord : coord) % 10;
	return digit >= 4 && digit <= 6;
}

const iterateRoomCoordinatesWithRange = makeAbstractIterateWithRangeTo(-Infinity, Infinity);

// The sector centers whose ±5 highway ring contains this room. Edge rooms belong to 1-2 sectors,
// corner rooms to 4; centers and interior rooms to none.
function *sectorsForCoordinate(rx: number, ry: number): Iterable<string> {
	for (const [ nx, ny ] of iterateRoomCoordinatesWithRange(rx, ry, 5)) {
		if (isCentralAxis(nx) && isCentralAxis(ny)) {
			yield makeSignedRoomName(nx, ny);
		}
	}
}

function classify(rx: number, ry: number): RoomType {
	if (isHighwayAxis(rx) || isHighwayAxis(ry)) {
		return 'highway';
	}
	if (isCentralAxis(rx) && isCentralAxis(ry)) {
		return 'center';
	}
	if (isCenterNineAxis(rx) && isCenterNineAxis(ry)) {
		return 'sourceKeeper';
	}
	return 'normal';
}

// Derives a room's geometry from the mod-10 sector template. Terrain-authoring paths
// (import, scrape, generation) stamp the result into the World schema; `GameMap` recomputes it here
// for room names it has no stored metadata for (e.g. rooms outside the loaded world).
export function computeRoomMeta(roomName: string): RoomMeta {
	const { rx, ry } = parseSignedRoomName(roomName);
	return { roomType: classify(rx, ry), centers: [ ...sectorsForCoordinate(rx, ry) ] };
}

const SECTOR_HALF_EXTENT = 250;

// `roomName` must be a highway ring member of `centralRoom` (see `RoomMeta.centers`). Returns a
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
