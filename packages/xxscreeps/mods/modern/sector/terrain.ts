import type { SectorControl } from './schema.js';
import type { World } from 'xxscreeps/game/map.js';
import type { HighwayOrientation } from 'xxscreeps/scripts/symbols.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeAbstractIterateWithRangeTo, makeLocalIterateInRangeTo } from 'xxscreeps/game/direction.js';
import { makeSignedRoomName, parseSignedRoomName } from 'xxscreeps/game/room/name.js';

const iterateRoomRing = makeAbstractIterateWithRangeTo(-Infinity, Infinity);
const iterateRoomArea = makeLocalIterateInRangeTo(-Infinity, Infinity);

// Iterates the sector-control records stamped on the world's center rooms.
export function *iterateSectors(world: World): IterableIterator<[ center: string, sector: SectorControl ]> {
	for (const [ roomName, entry ] of world.terrain) {
		const { sectorControl } = entry;
		if (sectorControl) {
			yield [ roomName, sectorControl ];
		}
	}
}

// Sector centers are the rooms numbered `{..}5` on each axis; the highway ring sits on the `{..}0`
// boundary rooms +-5 away. Keyed off the sign of the signed coordinate (W/N use the negative
// residue) so the test holds at any world size rather than a fixed half-world offset.
function isCentralAxis(coord: number): boolean {
	return coord < 0 ? coord % 10 === -6 : coord % 10 === 5;
}

// A highway axis sits exactly 5 rooms from a sector-center axis (the `{..}0` boundary). Defined off
// `isCentralAxis` so the W/N sign phase-shift is handled in one place rather than re-derived.
function isHighwayAxis(coord: number): boolean {
	return isCentralAxis(coord - 5) || isCentralAxis(coord + 5);
}

// The 3-wide central band of a sector -- printed digits 4, 5, 6, sign-agnostic so W4 and E4 both
// yield 4. Both axes in-band marks the 3x3 sector core: the center plus its 8 source-keeper rooms.
function isCenterNineAxis(coord: number): boolean {
	const digit = (coord < 0 ? -1 - coord : coord) % 10;
	return digit >= 4 && digit <= 6;
}

export type RoomType = 'normal' | 'highway' | 'sourceKeeper' | 'center';

/** Classifies a room by its role in the mod-10 sector template. */
export function roomType(roomName: string): RoomType {
	const { rx, ry } = parseSignedRoomName(roomName);
	if (isHighwayAxis(rx) || isHighwayAxis(ry)) {
		return 'highway';
	} else if (isCentralAxis(rx) && isCentralAxis(ry)) {
		return 'center';
	} else if (isCenterNineAxis(rx) && isCenterNineAxis(ry)) {
		return 'sourceKeeper';
	}
	return 'normal';
}

// Which sector-facing borders a highway room walls off: rooms on a vertical highway axis bound
// their east+west sides, rooms on a horizontal axis their top+bottom, and rooms on both axes are
// the crossings whose masses sit in the four corners.
export function highwayOrientation(roomName: string): HighwayOrientation {
	const { rx, ry } = parseSignedRoomName(roomName);
	if (isHighwayAxis(rx)) {
		return isHighwayAxis(ry) ? 'crossing' : 'vertical';
	}
	return 'horizontal';
}

// Derives a room's `meta` from the Screeps 9x9 (+1) sector template, for terraformation paths.
// `roomName` is assumed to be a sector center.
export function computeRoomMeta(roomName: string, rooms: ReadonlySet<string>) {
	const { rx, ry } = parseSignedRoomName(roomName);
	if (isCentralAxis(rx) && isCentralAxis(ry)) {
		const flatten = (coords: Iterable<readonly [ number, number ]>) => Fn.pipe(
			coords,
			$$ => Fn.map($$, ([ xx, yy ]) => makeSignedRoomName(xx, yy)),
			$$ => Fn.filter($$, name => rooms.has(name)),
			$$ => [ ...$$ ]);
		return {
			sectors: [ roomName ],
			sectorControl: {
				edges: flatten(iterateRoomRing(rx, ry, 5)),
				members: flatten(iterateRoomArea(rx, ry, 4)),
			},
		};
	} else {
		return {
			sectors: Fn.pipe(
				iterateRoomArea(rx, ry, 5),
				$$ => Fn.filter($$, ([ xx, yy ]) => isCentralAxis(xx) && isCentralAxis(yy)),
				$$ => Fn.map($$, ([ xx, yy ]) => makeSignedRoomName(xx, yy)),
				$$ => Fn.filter($$, name => rooms.has(name)),
				$$ => [ ...$$ ]),
			sectorControl: undefined,
		};
	}
}
