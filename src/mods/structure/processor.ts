import * as C from 'xxscreeps/game/constants';
import { Structure, checkDestroy } from './structure';
import { registerIntentProcessor } from 'xxscreeps/engine/processor';

declare module 'xxscreeps/engine/processor' {
	interface Intent { structure: typeof intents }
}
const intents = [
	registerIntentProcessor(Structure, 'destroyStructure', {}, (structure, context) => {
		if (checkDestroy(structure) === C.OK) {
			structure.room['#removeObject'](structure);
			context.didUpdate();
		}
	}),
];
