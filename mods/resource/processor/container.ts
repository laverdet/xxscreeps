import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { StructureContainer } from '../container';

registerObjectTickProcessor(StructureContainer, container => {
	if (container.ticksToDecay === 0) {
		const ownedController = Game.rooms[container.pos.roomName]!.controller?.owner;
		container.hits -= C.CONTAINER_DECAY;
		container._nextDecayTime = Game.time + (ownedController ?
			C.CONTAINER_DECAY_TIME_OWNED : C.CONTAINER_DECAY_TIME);
	}
});
