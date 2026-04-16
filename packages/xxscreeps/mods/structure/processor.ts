import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as ResourceIntent from 'xxscreeps/mods/resource/processor/resource.js';
import { Ruin } from './ruin.js';
import { Structure, checkDestroy } from './structure.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { structure: typeof intents }
}
const intents = [
	registerIntentProcessor(Structure, 'destroyStructure', {}, (structure, context) => {
		if (checkDestroy(structure) === C.OK) {
			structure['#destroy']();
			context.didUpdate();
		}
	}),
];

registerObjectTickProcessor(Ruin, (ruin, context) => {
	if (ruin.ticksToDecay === 0) {
		for (const [ resourceType, amount ] of ruin.store['#entries']()) {
			ResourceIntent.drop(ruin.pos, resourceType, amount);
		}
		ruin.room['#removeObject'](ruin);
		context.didUpdate();
	} else {
		context.wakeAt(ruin['#decayTime']);
	}
});
