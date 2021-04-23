import * as C from 'xxscreeps/game/constants';
import * as Structure from './structure';
import { registerIntentProcessor } from 'xxscreeps/processor';
import { RemoveObject } from 'xxscreeps/game/room';

declare module 'xxscreeps/processor' {
	interface Intent { structure: typeof intents }
}
const intents = [
	registerIntentProcessor(Structure.Structure, 'destroyStructure', (structure, context) => {
		if (Structure.checkDestroy(structure) === C.OK) {
			structure.room[RemoveObject](structure);
			context.didUpdate();
		}
	}),
];
