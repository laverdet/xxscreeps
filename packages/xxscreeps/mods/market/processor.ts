import type { OrderType } from './order.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { checkMyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { clamp, removeOne } from 'xxscreeps/utility/utility.js';
import { checkOrderParams } from './market.js';
import { chargeListingFee, expireOrder, insertOrder, loadMoney, loadOrdersById, patchOrderAmount, recordTransaction, removeOrder, removeUnreadableOrder, saveOrder } from './model.js';
import { StructureTerminal, calculateEnergyCost, checkSend } from './terminal.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { market: typeof intents }
}
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

	registerIntentProcessor(StructureTerminal, 'createOrder', {}, (
		terminal, context, orders: [ type: string, resourceType: ResourceType, price: number, totalAmount: number ][],
	) => {
		if (!Array.isArray(orders) || checkMyStructure(terminal, StructureTerminal) !== C.OK) {
			return;
		}
		const userId = terminal['#user']!;
		// Arbitrary intents can carry anything; coerce each entry before validating.
		const requests = [ ...function*() {
			for (const spec of orders.slice(0, C.MARKET_MAX_ORDERS)) {
				if (!Array.isArray(spec)) {
					continue;
				}
				const [ type, resourceType, rawPrice, rawTotalAmount ] = spec;
				const price = Math.round(rawPrice);
				const totalAmount = Math.trunc(rawTotalAmount);
				if (checkOrderParams(type, resourceType, price, totalAmount) === C.OK) {
					yield {
						// `checkOrderParams` narrowed `type`, invisibly to the checker.
						type: type as OrderType,
						resourceType, price, totalAmount,
						roomName: terminal.room.name,
						created: Game.time,
					};
				}
			}
		}() ];
		if (requests.length === 0) {
			return;
		}
		context.task(async function() {
			// Sequential, so each charge's order-cap check observes the previous insert.
			const ids: string[] = [];
			for (const fields of requests) {
				const fee = Math.ceil(fields.price * fields.totalAmount * C.MARKET_FEE);
				if (await chargeListingFee(context.shard, userId, fee)) {
					ids.push(await insertOrder(context.shard, userId, fields));
				}
			}
			return ids;
		}(), ids => {
			if (ids.length > 0) {
				terminal['#orderIds'].push(...ids);
				// `setActive` so next tick's maintenance pass (which already ran this tick) sees them.
				context.setActive();
			}
		});
	}),
];

// Maintain this terminal's orders from local state: expire aged orders (refunding the unspent
// listing fee), drop unreadable ones, then recompute each survivor's `active`/`amount` from terminal
// stock (sell) or the owner's affordable volume bounded by terminal free space (buy). Only orders
// whose state actually changed are rewritten.
registerObjectTickProcessor(StructureTerminal, (terminal, context) => {
	const ids = [ ...terminal['#orderIds'] ];
	if (ids.length === 0) {
		return;
	}
	// A buy order's advertised volume tracks the owner's credits, so a terminal holding orders keeps
	// its room ticking — the same standing heartbeat a spawn's energy regen provides.
	context.setActive();
	const { shard } = context;
	const userId = terminal['#user'];
	context.task(async function() {
		const orders = await loadOrdersById(shard, ids);
		const money = Fn.some(orders, order => order?.type === C.ORDER_BUY)
			? await loadMoney(shard, userId!) : 0;
		const now = Date.now();
		const dropped = await Fn.mapAwait(orders.entries(), async ([ index, order ]) => {
			if (order === undefined) {
				// Missing (already removed elsewhere) or stored under a foreign schema version; the
				// removal is idempotent, so both cases take one path.
				await removeUnreadableOrder(shard, ids[index]!, userId);
				return ids[index]!;
			}
			if (now - order.createdTimestamp > C.MARKET_ORDER_LIFE_TIME) {
				await expireOrder(shard, order);
				return order.id;
			}
			if (order['#user'] !== userId) {
				// The terminal changed hands; the order can no longer fill here.
				await removeOrder(shard, order);
				return order.id;
			}
			let active: boolean;
			let amount: number;
			if (order.type === C.ORDER_SELL) {
				const available = Math.min(terminal.store.getUsedCapacity(order.resourceType), order.remainingAmount);
				active = available > 0;
				amount = active ? available : 0;
			} else {
				// A buy order's advertised volume tracks the owner's credits even while the order is
				// inactive, bounded by the terminal's free space.
				const affordable = Math.floor(money / order['#price']);
				amount = Math.min(affordable, order.remainingAmount, terminal.store.getFreeCapacity());
				active = amount > 0;
			}
			if (order.active !== active) {
				order.active = active;
				order.amount = amount;
				await saveOrder(shard, order);
			} else if (order.amount !== amount) {
				await patchOrderAmount(shard, order.id, amount);
			}
		});
		return [ ...Fn.filter(dropped, (id): id is string => id !== undefined) ];
	}(), dropped => {
		if (dropped.length > 0) {
			// Prune ids one at a time — a `createOrder` finalized this tick may have anchored a new id.
			for (const id of dropped) {
				removeOne(terminal['#orderIds'], id);
			}
			context.didUpdate();
		}
	});
});
