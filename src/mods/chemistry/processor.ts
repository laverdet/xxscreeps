import C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { StructureLab, checkRunReaction, getReactionProduct } from './lab.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';

declare module 'xxscreeps/engine/processor' {
	interface Intent { chemistry: typeof intents }
}
const intents = [
	registerIntentProcessor(StructureLab, 'runReaction', {}, (lab, context, id1: string, id2: string) => {
		const left = Game.getObjectById<StructureLab>(id1)!;
		const right = Game.getObjectById<StructureLab>(id2)!;
		if (checkRunReaction(lab, left, right) === C.OK) {
			const product = getReactionProduct(left.mineralType, right.mineralType)!;
			lab.store['#add'](product, C.LAB_REACTION_AMOUNT);
			left.store['#subtract'](left.mineralType!, C.LAB_REACTION_AMOUNT);
			right.store['#subtract'](right.mineralType!, C.LAB_REACTION_AMOUNT);
			lab['#cooldownTime'] = Game.time + C.LAB_COOLDOWN;
			saveAction(lab, 'reaction1', left.pos);
			saveAction(lab, 'reaction2', left.pos);
			context.didUpdate();
		}
	}),
];
