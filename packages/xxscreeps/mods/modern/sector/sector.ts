import type { SectorControl } from './schema.js';
import type { World } from 'xxscreeps/game/map.js';
import { parseSignedRoomName, roomLinearDistance } from 'xxscreeps/game/room/name.js';

// Iterates the sector-control records stamped on the world's center rooms.
export function *iterateSectors(world: World): IterableIterator<[ center: string, sector: SectorControl ]> {
	for (const [ roomName, entry ] of world.terrain) {
		const { sectorControl } = entry;
		if (sectorControl) {
			yield [ roomName, sectorControl ];
		}
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
			// The sharing centers sit equidistant from the subject room, `2 * linearDistance` rooms
			// apart, so a coordinate belongs to `centralRoom` within half that spacing.
			const radius = linearDistance * 50;
			for (const sector of sectorNames) {
				const parsedSector = parseSignedRoomName(sector);
				if (roomLinearDistance(parsedSector, here) !== linearDistance) {
					throw new Error(`Irregular sector geometry ${roomName} ${sectorNames.join(',')}`);
				}
			}
			const xBase = (here.rx - center.rx) * 50 - 24;
			const yBase = (here.ry - center.ry) * 50 - 24;
			const xInside = Math.max(Math.abs(xBase), Math.abs(xBase + 49)) < radius;
			const yInside = Math.max(Math.abs(yBase), Math.abs(yBase + 49)) < radius;
			if (xInside && yInside) {
				return () => true;
			} else if (xInside) {
				return (xx, yy) => Math.abs(yBase + yy) < radius;
			} else if (yInside) {
				return xx => Math.abs(xBase + xx) < radius;
			} else {
				return (xx, yy) => Math.abs(xBase + xx) < radius && Math.abs(yBase + yy) < radius;
			}
		}
	}
}
