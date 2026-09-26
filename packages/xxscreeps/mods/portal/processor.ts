import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import { teleportCreep } from 'xxscreeps/mods/classic/creep/processor.js';
import * as C from 'xxscreeps:mods/constants';
import { StructurePortal } from './portal.js';

// A stable portal's window runs on the wall clock, which no wake can be scheduled against, so its
// room re-checks the window on multiples of this many ticks. Every room checks on the same ticks, so
// portals sharing a window start decaying together wherever they stand.
export const kUnstableCheckInterval = 100;

registerObjectTickProcessor(StructurePortal, (portal, context) => {
	if (portal.ticksToDecay === 0) {
		portal.room['#removeObject'](portal);
		context.didUpdate();
		return;
	} else if (portal['#unstableTime'] === 0) {
		context.wakeAt(portal['#decayTime']);
	} else if (Game.time % kUnstableCheckInterval === 0 && Date.now() > portal['#unstableTime']) {
		portal['#decayTime'] = Game.time + C.PORTAL_DECAY;
		portal['#unstableTime'] = 0;
		context.didUpdate();
		context.wakeAt(portal['#decayTime']);
	} else {
		context.wakeAt(Game.time + kUnstableCheckInterval - Game.time % kUnstableCheckInterval);
	}

	// Cross-shard portals are not yet supported (single-shard server)
	const dest = portal.destination;
	if (dest.shard === undefined) {
		for (const object of portal.room['#lookAt'](portal.pos)) {
			if (object instanceof Creep && object['#user'].length > 2) {
				teleportCreep(object, dest, context);
			}
		}
	}
});
