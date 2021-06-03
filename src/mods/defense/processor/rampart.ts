import * as C from 'xxscreeps/game/constants';
import { Game, me } from 'xxscreeps/game';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { StructureRampart } from '../rampart';

const intent = registerIntentProcessor(StructureRampart, 'setPublic', (rampart, context, isPublic: boolean) => {
	if (rampart['#user'] === me) {
		rampart.isPublic = Boolean(isPublic);
		context.didUpdate();
	}
});
declare module 'xxscreeps/engine/processor' {
	interface Intent { defenseRampart: typeof intent }
}

registerObjectTickProcessor(StructureRampart, (rampart, context) => {
	if (rampart.ticksToDecay === 0) {
		rampart.hits -= C.RAMPART_DECAY_AMOUNT;
		if (rampart.hits <= 0) {
			rampart.room['#removeObject'](rampart);
		}
		rampart['#nextDecayTime'] = Game.time + C.RAMPART_DECAY_TIME - 1;
		context.didUpdate();
	}
	context.wakeAt(rampart['#nextDecayTime']);
});
