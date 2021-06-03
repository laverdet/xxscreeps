import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { StructureContainer } from '../container';

registerObjectTickProcessor(StructureContainer, (container, context) => {
	if (container.ticksToDecay === 0) {
		const ownedController = (container.room.controller?.level ?? 0) > 0;
		container.hits -= C.CONTAINER_DECAY;
		if (container.hits <= 0) {
			container.room['#removeObject'](container);
		}
		container['#nextDecayTime'] = Game.time + (ownedController ?
			C.CONTAINER_DECAY_TIME_OWNED : C.CONTAINER_DECAY_TIME) - 1;
		context.didUpdate();
	}
	context.wakeAt(container['#nextDecayTime']);
});
