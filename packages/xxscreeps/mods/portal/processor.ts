import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { teleportCreep } from 'xxscreeps/mods/creep/processor.js';
import { StructurePortal } from './portal.js';

registerObjectTickProcessor(StructurePortal, (portal, context) => {
	const decayTime = portal['#decayTime'];
	if (decayTime !== 0 && Game.time >= decayTime) {
		portal.room['#removeObject'](portal);
		context.didUpdate();
		return;
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

	if (decayTime !== 0) {
		context.wakeAt(decayTime);
	}
});
