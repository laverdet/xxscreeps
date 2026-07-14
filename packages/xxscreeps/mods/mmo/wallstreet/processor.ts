import type { OrderType } from './order.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { StructureTerminal } from 'xxscreeps/mods/classic/brokerage/terminal.js';
import { checkMyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { instantiate, removeOne } from 'xxscreeps/utility/utility.js';
import { checkOrderParams } from './market.js';
import { deleteOrder, incrementUserCredits, insertOrder, loadAndReadMarketOrder, loadUserCredits, updateOrderAmount } from './model.js';
import { Order } from './order.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { wallstreet: typeof intents }
}

export type OrderIntent = [ type: OrderType, resourceType: ResourceType, price: number, totalAmount: number ];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
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
