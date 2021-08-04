import type { ResourceType } from 'xxscreeps/mods/resource';
import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { Room } from 'xxscreeps/game/room';
import { registerIntentProcessor } from 'xxscreeps/engine/processor';
import { clamp } from 'xxscreeps/utility/utility';
import { StructureTerminal, calculateEnergyCost, checkSend } from './terminal';

declare module 'xxscreeps/engine/processor' {
	interface Intent { market: typeof intents }
}
const intents = [
	registerIntentProcessor(StructureTerminal, 'send', {}, (
		terminal, context, resourceType: ResourceType, amount: number, destination: string, description: string | null,
	) => {
		if (checkSend(terminal, resourceType, amount, destination, description) === C.OK) {
			// Calculate transfer
			const range = Game.map.getRoomLinearDistance(terminal.room.name, destination);
			const energyCost = calculateEnergyCost(amount, range);
			context.task(async function() {
				// Check other outstanding sends to this terminal
				const [ room, totalAmount ] = await Promise.all([
					context.shard.loadRoom(destination),
					context.shard.scratch.incrBy(`room/${destination}/terminalIngress`, amount),
				]);
				const capacity = room.terminal?.store.getFreeCapacity() ?? 0;
				return clamp(0, amount, capacity + amount - totalAmount);
			}(), amount => {
				if (amount > 0) {
					// Deduct energy from this terminal
					if (resourceType === C.RESOURCE_ENERGY) {
						terminal.store['#subtract'](C.RESOURCE_ENERGY, amount + energyCost);
					} else {
						terminal.store['#subtract'](C.RESOURCE_ENERGY, energyCost);
						terminal.store['#subtract'](resourceType, amount);
					}
					context.didUpdate();

					// Send intent to destination room
					context.sendRoomIntent(destination, 'terminalSend', resourceType, amount);
				}
			});
		}
	}),

	registerIntentProcessor(Room, 'terminalSend', { internal: true }, (room, context, resourceType: ResourceType, amount: number) => {
		context.task(context.shard.scratch.del(`room/${room.name}/terminalIngress`));
		room.terminal?.store['#add'](resourceType, amount);
		context.didUpdate();
	}),
];
