import type { ResourceType } from 'xxscreeps/mods/resource';
import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { registerIntentProcessor } from 'xxscreeps/engine/processor';
import { StructureTerminal, calculateEnergyCost, checkSend } from './terminal';

declare module 'xxscreeps/engine/processor' {
	interface Intent { market: typeof intent }
}
const intent = registerIntentProcessor(StructureTerminal, 'send', {}, (
	terminal, context, resourceType: ResourceType, amount: number, destination: string, description: string | null,
) => {
	if (checkSend(terminal, resourceType, amount, destination, description) === C.OK) {
		const range = Game.map.getRoomLinearDistance(terminal.room.name, destination);
		const energyCost = calculateEnergyCost(amount, range);
		if (resourceType === C.RESOURCE_ENERGY) {
			terminal.store['#subtract'](C.RESOURCE_ENERGY, amount + energyCost);
		} else {
			terminal.store['#subtract'](C.RESOURCE_ENERGY, energyCost);
			terminal.store['#subtract'](resourceType, amount);
		}
		// TODO: Actually send it!
		context.didUpdate();
	}
});