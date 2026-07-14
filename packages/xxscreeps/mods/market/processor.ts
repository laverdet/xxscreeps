import type { OrderType } from './order.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { checkMyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { clamp, instantiate, removeOne } from 'xxscreeps/utility/utility.js';
import { checkOrderParams } from './market.js';
import { deleteOrder, incrementUserCredits, insertOrder, loadAndReadMarketOrder, loadUserCredits, recordTransaction, updateOrderAmount } from './model.js';
import { Order } from './order.js';
import { StructureTerminal, calculateEnergyCost, checkSend } from './terminal.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { market: typeof intents }
}

export type OrderIntent = [ type: OrderType, resourceType: ResourceType, price: number, totalAmount: number ];

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

	registerIntentProcessor(StructureTerminal, 'createOrder', {}, (terminal, context, orders: OrderIntent[]) => {
		if (!Array.isArray(orders) || checkMyStructure(terminal, StructureTerminal) !== C.OK) {
			return;
		}
		const { time } = Game;
		context.task(function() {
			const userId = terminal['#user']!;
			return Fn.mapAwait(
				Fn.slice(orders, 0, C.MARKET_MAX_ORDERS),
				async ([ type, resourceType, price, totalAmount ]) => {
					if (checkOrderParams(type, resourceType, price, totalAmount) === C.OK) {
						const buy = type === C.ORDER_BUY;
						const fee = Math.ceil(price * totalAmount * C.MARKET_FEE);
						if (await incrementUserCredits(context.shard, userId, -fee)) {
							const id = Id.generateId();
							const order = instantiate(Order, {
								id,
								amount: 0,
								created: time,
								createdTimestamp: Date.now(),
								remainingAmount: totalAmount,
								resourceType,
								roomName: terminal.room.name,
								totalAmount,
							});
							order['#buy'] = type === C.ORDER_BUY;
							order['#price'] = price;
							order['#user'] = userId;
							await insertOrder(context.shard, order);
							return { id, buy };
						}
					}
				});
		}(), orders => {
			const terminalOrders = terminal['#orders'];
			const { length } = terminalOrders;
			terminalOrders.push(...Fn.filter(orders));
			if (terminalOrders.length !== length) {
				context.setActive();
			}
		});
	}),
];

// Update market book `amount` field for orders owned by this terminal
// TODO: On construction, acquire orphaned orders
// TODO: On destruction, update orphaned orders to `amount = 0`
registerObjectTickProcessor(StructureTerminal, (terminal, context) => {
	const terminalOrders = terminal['#orders'];
	if (terminalOrders.length === 0) {
		return;
	}
	context.setActive();
	context.task(async function() {
		// We only need user credit information if the user has an outstanding buy order
		const userId = terminal['#user']!;
		const hasBuyOrder = terminalOrders.some(order => order.buy);
		const userCredits = hasBuyOrder ? await loadUserCredits(context.shard, userId) : 0;

		// Update market book orders based on the terminal's stock and/or user's credits
		await Fn.mapAwait(terminalOrders, async terminalOrder => {
			const marketOrder = await loadAndReadMarketOrder(context.shard, terminalOrder.id);
			if (marketOrder) {
				const amount = terminalOrder.buy
					? Math.min(terminal.store.getFreeCapacity(), marketOrder.remainingAmount, Math.floor(userCredits / marketOrder['#price']))
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					: Math.min(terminal.store[marketOrder.resourceType] ?? 0, marketOrder.remainingAmount);
				if (marketOrder.amount !== amount) {
					await updateOrderAmount(context.shard, marketOrder.id, amount);
				}
			} else {
				removeOne(terminalOrders, terminalOrder);
				await deleteOrder(context.shard, terminalOrder.id, userId);
			}
		});
	}());
});
