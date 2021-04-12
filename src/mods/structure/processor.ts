import * as C from 'xxscreeps/game/constants';
import * as Structure from './structure';
import { registerIntentProcessor } from 'xxscreeps/processor';
import { removeObject } from 'xxscreeps/game/room/methods';

declare module 'xxscreeps/processor' {
	interface Intent { structure: typeof intents }
}
const intents = [
	registerIntentProcessor(Structure.Structure, 'destroyStructure', (structure, context) => {
		if (Structure.checkDestroy(structure) === C.OK) {
			removeObject(structure);
			context.didUpdate();
		}
	}),
];
