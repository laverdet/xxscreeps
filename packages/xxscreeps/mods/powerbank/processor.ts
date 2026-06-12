import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { StructurePowerBank } from './powerbank.js';

registerObjectTickProcessor(StructurePowerBank, (powerBank, context) => {
	if (powerBank.ticksToDecay === 0) {
		powerBank.room['#removeObject'](powerBank);
		context.didUpdate();
	} else {
		context.wakeAt(powerBank['#nextDecayTime']);
	}
});
