import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { StructurePowerBank } from './powerbank.js';
// Pull the placement policy into the processor slot so its intent processor registers in the processor
// service (the shard-tick processor runs in main via main.ts). Without this the intent never
// registers in the real worker, though the test harness — which loads both slots — would hide it.
import './place.js';

registerObjectTickProcessor(StructurePowerBank, (powerBank, context) => {
	if (powerBank.ticksToDecay === 0) {
		powerBank.room['#removeObject'](powerBank);
		context.didUpdate();
	} else {
		context.wakeAt(powerBank['#nextDecayTime']);
	}
});
