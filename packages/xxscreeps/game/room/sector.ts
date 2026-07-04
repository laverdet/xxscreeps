import { Fn } from 'xxscreeps/functional/fn.js';
import { makeAbstractIterateWithRangeTo, makeLocalIterateInRangeTo } from 'xxscreeps/game/direction.js';
import { makeSignedRoomName, parseSignedRoomName } from './name.js';

// Sector centers are the rooms numbered `{..}5` on each axis; the highway ring sits on the `{..}0`
// boundary rooms +-5 away. Keyed off the sign of the signed coordinate (W/N use the negative
// residue) so the test holds at any world size rather than a fixed half-world offset.
function isCentralAxis(coord: number): boolean {
	return coord < 0 ? coord % 10 === -6 : coord % 10 === 5;
}

const iterateRoomRing = makeAbstractIterateWithRangeTo(-Infinity, Infinity);
const iterateRoomArea = makeLocalIterateInRangeTo(-Infinity, Infinity);

// Derives a room's `meta` from the mod-10 sector template, for terrain-authoring paths (import,
// scrape, generation) to stamp into the World schema. A center room gets the sector record it
// anchors: `edges` is the highway ring at range 5, shared with adjacent sectors; `members` are the
// rooms it exclusively registers — the 9x9 interior, itself included. Names absent from `rooms`
// are clipped so the record describes the world actually being authored.
export function computeRoomMeta(roomName: string, rooms: ReadonlySet<string>) {
	const { rx, ry } = parseSignedRoomName(roomName);
	const present = (coords: Iterable<readonly [ number, number ]>) => Fn.pipe(
		coords,
		$$ => Fn.map($$, ([ xx, yy ]) => makeSignedRoomName(xx, yy)),
		$$ => Fn.filter($$, name => rooms.has(name)),
		$$ => [ ...$$ ]);
	return {
		sector: isCentralAxis(rx) && isCentralAxis(ry) ? {
			edges: present(iterateRoomRing(rx, ry, 5)),
			members: present(iterateRoomArea(rx, ry, 4)),
		} : undefined,
	};
}

const SECTOR_HALF_EXTENT = 250;

// `roomName` must be a highway ring member of `centralRoom` (see the sector record's `edges`).
// Returns a position predicate for the sector's 250-square radius. The radius only clips boundary
// rooms: a room whose extent on the central axis stays within the radius is wholly inside on that
// axis, and one inside on both axes needs no test at all.
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
