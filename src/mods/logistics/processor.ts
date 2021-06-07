import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { registerIntentProcessor, registerObjectPreTickProcessor } from 'xxscreeps/engine/processor';
import { StructureLink, checkTransferEnergy } from './link';
import { saveAction } from 'xxscreeps/game/object';
import { flushActionLog } from 'xxscreeps/engine/processor/object';

declare module 'xxscreeps/engine/processor' {
	interface Intent { logistics: typeof intents }
}
const intents = [
	registerIntentProcessor(StructureLink, 'transferEnergy', {}, (link, context, id: string, amount: number) => {
		const target = Game.getObjectById<StructureLink>(id)!;
		if (checkTransferEnergy(link, target, amount) === C.OK) {
			link.store['#subtract'](C.RESOURCE_ENERGY, amount);
			target.store['#add'](C.RESOURCE_ENERGY, Math.floor(amount * (1 - C.LINK_LOSS_RATIO)));
			link['#cooldownTime'] = Game.time + C.LINK_COOLDOWN * link.pos.getRangeTo(target) - 1;
			saveAction(link, 'transferEnergy', target.pos);
		}
	}),
];

registerObjectPreTickProcessor(StructureLink, (link, context) => flushActionLog(link['#actionLog'], context));
