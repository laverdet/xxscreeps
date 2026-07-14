import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import { teleportCreep } from 'xxscreeps/mods/classic/creep/processor.js';
import { StructurePortal } from './portal.js';

registerObjectTickProcessor(StructurePortal, (portal, context) => {
	if (portal.ticksToDecay === 0) {
		portal.room['#removeObject'](portal);
		context.didUpdate();
		return;
	} else {
		context.wakeAt(portal['#decayTime']);
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
