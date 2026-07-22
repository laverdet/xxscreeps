import type { NullMessage } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { UpdateSchemaBlob, loadUpgradedWithWriteBack } from 'xxscreeps/engine/schema/keyval.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Order, orderAmountOffsetOf, orderSchemaVersion, readOrder, upgradeOrder, writeOrder } from './order.js';

// -- User credits --

// Stored on the user info hash
const userCreditsField = 'credits';

// Channel for user credit changes
export const userCreditsChannel =
	(shard: Shard, userId: string): UserCreditsChannel => new Channel(shard.pubsub, `user/${userId}/market/credits`);

export type UserCreditsChannel = Channel<
	NullMessage |
	{ type: 'changed'; amount: number }
>;

// User credit balance in millicredits; `Game.market.credits` divides by 1000.
export async function loadUserCredits(shard: Shard, userId: string) {
	return Number(await shard.db.data.hGet(User.infoKey(userId), userCreditsField)) || 0;
}

// Apply `delta` to the user's credit balance. Returns `true` on success or `false` if the user's
// credits would have been decremented below zero.
export async function incrementUserCredits(shard: Shard, userId: string, amount: number) {
	if (amount < 0) {
		const [ [ , delta ] ] = await Promise.all([
			shard.db.data.hIncrByEx(User.infoKey(userId), userCreditsField, amount, { lBound: 0 }),
			userCreditsChannel(shard, userId).publish({ type: 'changed', amount }),
		]);
		if (delta === amount) {
			return true;
		} else {
			await userCreditsChannel(shard, userId).publish({ type: 'changed', amount: delta - amount });
			return false;
		}
	} else {
		await Promise.all([
			shard.db.data.hincrBy(User.infoKey(userId), userCreditsField, amount),
			userCreditsChannel(shard, userId).publish({ type: 'changed', amount }),
		]);
		return true;
	}
}

// -- Order book --

// Every order, scored by wall-clock creation time
const allOrdersKey = 'market/orders';

// Active orders, as a plain set
export const activeOrdersKey = 'market/orders/active';

// A user's own orders, as a plain set
export const userOrdersKey = (userId: string) => `user/${userId}/market/orders`;

// Schema blob for a market order
const orderBlobKey = (id: string) => `market/order/${id}`;

// Global market channel which receives events for market changes
export const marketChannel = (shard: Shard): MarketChannel => new Channel(shard.pubsub, 'market/orders');
export type MarketChannel = Channel<
	{ type: 'inserted'; id: string; userId: string } |
	{ type: 'removed'; id: string; userId: string | undefined } |
	{ type: 'updated'; id: string; amount: number }
>;

// Load all active and inactive market orders, order by creation time.
export function loadMarketOrderIds(shard: Shard) {
	return shard.data.zRange(allOrdersKey, -Infinity, Infinity, { by: 'SCORE' });
}

// Load a market blob by id. If the blob is not found `null` is returned. The blob is upgraded in
// place on version mismatch. There is a small possibility of a race condition in that case, but
// probably only theoretical.
export function loadMarketOrderBlob(shard: Shard, id: string) {
	return loadUpgradedWithWriteBack(
		shard.db,
		upgradeOrder,
		() => shard.data.get(orderBlobKey(id), { blob: true }),
		blob => shard.data.set(orderBlobKey(id), blob),
	);
}

// Load a readable market order
export async function loadAndReadMarketOrder(shard: Shard, id: string) {
	const blob = await loadMarketOrderBlob(shard, id);
	if (blob) {
		return readOrder(blob);
	}
}

// Write a new order and index it.
export async function insertOrder(shard: Shard, order: Order) {
	const orderId = order.id;
	const userId = order['#user'];
	await Promise.all([
		shard.data.set(orderBlobKey(orderId), writeOrder(order)),
		shard.data.zAdd(allOrdersKey, [ [ order.createdTimestamp, orderId ] ]),
		order.active &&
			shard.data.sAdd(activeOrdersKey, [ orderId ]),
		shard.data.sAdd(userOrdersKey(userId), [ orderId ]),
		marketChannel(shard).publish({ type: 'inserted', id: orderId, userId }),
	]);
}

// Patch the advertised volume in place — the common case as stock and credits fluctuate.
export async function updateOrderAmount(shard: Shard, orderId: string, amount: number) {
	return Promise.all([
		shard.data.eval(
			UpdateSchemaBlob,
			[ orderBlobKey(orderId) ],
			[ orderSchemaVersion, orderAmountOffsetOf, 'int32', amount, 'set' ]),
		amount === 0
			? shard.data.sRem(activeOrdersKey, [ orderId ])
			: shard.data.sAdd(activeOrdersKey, [ orderId ]),
		marketChannel(shard).publish({ type: 'updated', id: orderId, amount }),
	]);
}

// Deletes the order blob and index fields. No refund takes place.
export function deleteOrder(shard: Shard, orderId: string, userId?: string) {
	return Promise.all([
		marketChannel(shard).publish({ type: 'removed', id: orderId, userId }),
		userId !== undefined &&
			shard.data.sRem(userOrdersKey(userId), [ orderId ]),
		shard.data.sRem(activeOrdersKey, [ orderId ]),
		shard.data.zRem(allOrdersKey, [ orderId ]),
		shard.data.del(orderBlobKey(orderId)),
	]);
}

// Expire an aged order, refunding the unspent share of the listing fee.
export async function expireOrder(shard: Shard, order: Order) {
	const refund = Math.floor(order.remainingAmount * order['#price'] * C.MARKET_FEE);
	await Promise.all([
		refund > 0 &&
			incrementUserCredits(shard, order['#user'], refund),
		deleteOrder(shard, order.id, order['#user']),
	]);
}

// Return all order ids whose wall time have exceeded the lifetime window.
export async function expiredOrders(shard: Shard) {
	return shard.data.zRange(allOrdersKey, 0, Date.now() - C.MARKET_ORDER_LIFE_TIME, { by: 'SCORE' });
}
