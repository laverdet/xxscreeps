import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { StructureLink, checkTransferEnergy } from './link.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { logistics: typeof intents }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructureLink, 'transferEnergy', {}, (link, context, id: string, amount: number) => {
		const target = Game.getObjectById<StructureLink>(id)!;
		if (checkTransferEnergy(link, target, amount) === C.OK) {
			link.store['#subtract'](C.RESOURCE_ENERGY, amount);
			target.store['#add'](C.RESOURCE_ENERGY, Math.floor(amount * (1 - C.LINK_LOSS_RATIO)));
			link['#cooldownTime'] = Game.time + C.LINK_COOLDOWN * link.pos.getRangeTo(target) - 1;
			saveAction(link, 'transferEnergy', target.pos);
			context.didUpdate();
		}
	}),
];
