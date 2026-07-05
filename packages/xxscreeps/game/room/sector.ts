import { Fn } from 'xxscreeps/functional/fn.js';
import { makeAbstractIterateWithRangeTo, makeLocalIterateInRangeTo } from 'xxscreeps/game/direction.js';
import { makeSignedRoomName, parseSignedRoomName, roomLinearDistance } from './name.js';

// Sector centers are the rooms numbered `{..}5` on each axis; the highway ring sits on the `{..}0`
// boundary rooms +-5 away. Keyed off the sign of the signed coordinate (W/N use the negative
// residue) so the test holds at any world size rather than a fixed half-world offset.
function isCentralAxis(coord: number): boolean {
	return coord < 0 ? coord % 10 === -6 : coord % 10 === 5;
}

const iterateRoomRing = makeAbstractIterateWithRangeTo(-Infinity, Infinity);
const iterateRoomArea = makeLocalIterateInRangeTo(-Infinity, Infinity);

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

// Given a central room, a subject room, and the sectors to which the subject belongs-- returns a
// predicate determining whether or not a coordinate in the subject belongs to the `centralRoom`
// sector.
export function makeSectorRadiusPredicate(centralRoom: string, roomName: string, sectorNames: string[]): (xx: number, yy: number) => boolean {
	switch (sectorNames.length) {
		case 0: throw new Error(`Room ${roomName} has no sector record`);
		case 1: return () => true;
		default: {
			const here = parseSignedRoomName(roomName);
			const center = parseSignedRoomName(centralRoom);
			const linearDistance = roomLinearDistance(here, center);
			const linearDistance05 = linearDistance >> 1;
			for (const sector of sectorNames) {
				const parsedSector = parseSignedRoomName(sector);
				if (roomLinearDistance(parsedSector, center) !== linearDistance) {
					throw new Error(`Irregular sector geometry ${roomName} ${sectorNames.join(',')}`);
				}
			}
			const xBase = (here.rx - center.rx) * 50 - 24;
			const yBase = (here.ry - center.ry) * 50 - 24;
			const xInside = Math.max(Math.abs(xBase), Math.abs(xBase + 49)) < linearDistance05;
			const yInside = Math.max(Math.abs(yBase), Math.abs(yBase + 49)) < linearDistance05;
			if (xInside && yInside) {
				return () => true;
			} else if (xInside) {
				return (xx, yy) => Math.abs(yBase + yy) < linearDistance05;
			} else if (yInside) {
				return xx => Math.abs(xBase + xx) < linearDistance05;
			} else {
				return (xx, yy) => Math.abs(xBase + xx) < linearDistance05 && Math.abs(yBase + yy) < linearDistance05;
			}
		}
	}
}
