import type { RemotePortalDestination } from './portal.js';
import { hooks } from 'xxscreeps/scripts/symbols.js';
import { StructurePortal } from './portal.js';

// An inter-room destination, as its `RoomPosition` serializes.
interface PositionDestination { roomName: string; shard?: undefined; x: number; y: number }

// A stable portal's unstable time is wall time, which means the same thing in any world. A decaying
// portal's `#decayTime` is an absolute tick, which a payload has no baseline for, so it stays behind
// with the other objects a payload doesn't carry.
hooks.register('payload', {
	marker: 'P',
	encode(object) {
		if (object instanceof StructurePortal && object['#decayTime'] === 0) {
			const { destination } = object;
			return {
				destination: destination.shard === undefined
					? { roomName: destination.roomName, x: destination.x, y: destination.y }
					: destination,
				...object['#unstableTime'] !== 0 && { unstableTime: object['#unstableTime'] },
			};
		}
	},
	decode(meta) {
		const destination = meta.destination!;
		const portal = new StructurePortal();
		if (destination.shard === undefined) {
			portal['#destRoom'] = destination.roomName;
			portal['#destX'] = destination.x;
			portal['#destY'] = destination.y;
		} else {
			portal['#destShard'] = destination.shard;
			portal['#destRoom'] = destination.room;
		}
		portal['#unstableTime'] = meta.unstableTime ?? 0;
		return portal;
	},
});

declare module 'xxscreeps/scripts/symbols.js' {
	interface PayloadObject {
		/** Where a portal leads. */
		destination?: PositionDestination | RemotePortalDestination;
		/** Wall-clock ms when a portal starts to decay, absent for one that never will. */
		unstableTime?: number;
	}
}
