import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { clamp } from 'xxscreeps/utility/utility.js';
import { recordTransaction } from './model.js';
import { StructureTerminal, calculateEnergyCost, checkSend } from './terminal.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructureTerminal, 'send', {}, (
		terminal, context, resourceType: ResourceType, amount: number, destination: string, description: string | null,
	) => {
		if (checkSend(terminal, resourceType, amount, destination, description) === C.OK) {
			// Calculate transfer
			const range = Game.map.getRoomLinearDistance(terminal.room.name, destination);
			const energyCost = calculateEnergyCost(amount, range);
			const senderId = terminal['#user']!;
			context.task(async function() {
				// Check other outstanding sends to this terminal
				const [ room, totalAmount ] = await Promise.all([
					context.shard.loadRoom(destination),
					context.shard.scratch.incrBy(`room/${destination}/terminalIngress`, amount),
				]);
				const capacity = room.terminal?.store.getFreeCapacity() ?? 0;
				const sent = clamp(0, amount, capacity + amount - totalAmount);
				const recipientId = room.terminal?.['#user'];
				return { sent, recipientId };
			}(), ({ sent, recipientId }) => {
				if (sent > 0) {
					// Deduct energy from this terminal
					if (resourceType === C.RESOURCE_ENERGY) {
						terminal.store['#subtract'](C.RESOURCE_ENERGY, sent + energyCost);
					} else {
						terminal.store['#subtract'](C.RESOURCE_ENERGY, energyCost);
						terminal.store['#subtract'](resourceType, sent);
					}
					terminal['#cooldownTime'] = Game.time + C.TERMINAL_COOLDOWN - 1;
					context.didUpdate();

					// Send intent to destination room
					context.sendRoomIntent(destination, 'terminalSend', resourceType, sent);

					// Log the transfer for both parties' market transaction history
					if (recipientId != null) {
						context.task(recordTransaction(context.shard, senderId, recipientId, {
							time: Game.time - 1,
							resourceType,
							amount: sent,
							from: terminal.room.name,
							to: destination,
							description,
						}));
					}
				}
			});
		}
	}),

	registerIntentProcessor(Room, 'terminalSend', { internal: true }, (room, context, resourceType: ResourceType, amount: number) => {
		context.task(context.shard.scratch.vDel(`room/${room.name}/terminalIngress`));
		room.terminal?.store['#add'](resourceType, amount);
		context.didUpdate();
	}),
];

// ---

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { brokerage: typeof intents }
}
