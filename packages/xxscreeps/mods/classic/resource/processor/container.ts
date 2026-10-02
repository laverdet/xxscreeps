import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { expiresNextTick } from 'xxscreeps/game/object.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureContainer } from '../container.js';
import { drop } from './resource.js';

registerObjectTickProcessor(StructureContainer, (container, context) => {
	if (expiresNextTick(container['#nextDecayTime'])) {
		const ownedController = (container.room.controller?.level ?? 0) > 0;
		container.hits -= C.CONTAINER_DECAY;
		if (container.hits <= 0) {
			for (const [ resourceType, amount ] of container.store['#entries']()) {
				drop(container.pos, resourceType, amount);
			}
			appendEventLog(container.room, {
				event: C.EVENT_OBJECT_DESTROYED,
				objectId: container.id,
				type: container.structureType,
			});
			container.room['#removeObject'](container);
		}
		container['#nextDecayTime'] = Game.time + (ownedController
			? C.CONTAINER_DECAY_TIME_OWNED : C.CONTAINER_DECAY_TIME);
		context.didUpdate();
	}
	context.wakeAt(container['#nextDecayTime']);
});
