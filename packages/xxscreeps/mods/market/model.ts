import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { UpdateSchemaBlob, loadUpgradedWithWriteBack } from 'xxscreeps/engine/schema/keyval.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { Order, orderAmountOffsetOf, orderSchemaVersion, readOrder, upgradeOrder, writeOrder } from './order.js';
import { Transaction, upgrade, write } from './transaction.js';

// A terminal transfer is normalized: stored once as an immutable schema blob at
// `market/transaction/<id>` and referenced by id from each party's per-direction sorted set, scored
// by wall-clock time. The blob carries a `px` TTL so it self-frees after the read window; the set
// entries are score-trimmed to the same window. Both parties' runtimes are handed the same blob.
const kTransactionWindow = 24 * 60 * 60 * 1000;
// `incomingTransactions` / `outgoingTransactions` expose the most recent transfers, capped at the
// smaller of the 24h window or this count.
const kReadLimit = 100;

type Direction = 'incoming' | 'outgoing';

const blobKey = (id: string) => `market/transaction/${id}`;
const setKey = (userId: string, direction: Direction) => `user/${userId}/market/transactions/${direction}`;

export function getTransactionChannel(shard: Shard, userId: string) {
	return new Channel<{ type: 'updated' }>(shard.pubsub, `user/${userId}/market/transactions`);
}

export interface TransactionFields {
	time: number;
	resourceType: ResourceType;
	amount: number;
	from: string;
	to: string;
	description?: string | undefined | null;
}

export function loadTransactionBlob(shard: Shard, id: string) {
	return loadUpgradedWithWriteBack(
		() => shard.data.req(blobKey(id), { blob: true }),
		blob => shard.data.set(blobKey(id), blob),
		upgrade,
	);
}

// A user's transfer ids in one direction, oldest-first with their wall-clock scores.
function loadDirection(shard: Shard, userId: string, direction: Direction, cutoff: number) {
	return shard.data.zRange(setKey(userId, direction), Infinity, cutoff, { by: 'SCORE', limit: [ 0, kReadLimit ], rev: true });
}

export async function loadTransactionEntries(shard: Shard, userId: string) {
	const cutoff = Date.now() - kTransactionWindow;
	const [ incoming, outgoing ] = await Promise.all([
		loadDirection(shard, userId, 'incoming', cutoff),
		loadDirection(shard, userId, 'outgoing', cutoff),
	]);
	return { incoming, outgoing };
}

async function reference(shard: Shard, userId: string, direction: Direction, time: number, id: string) {
	const key = setKey(userId, direction);
	await Promise.all([
		shard.data.zAdd(key, [ [ time, id ] ]),
		// Drop entries that have aged out of the read window so the set stays bounded.
		shard.data.zRemRange(key, 0, time - kTransactionWindow),
	]);
}

export async function recordTransaction(shard: Shard, senderId: string, recipientId: string, fields: TransactionFields) {
	const id = Id.generateId();
	const transaction = assign(new Transaction(), {
		transactionId: id,
		time: fields.time,
		resourceType: fields.resourceType,
		amount: fields.amount,
		from: fields.from,
		to: fields.to,
	});
	transaction['#sender'] = senderId;
	transaction['#recipient'] = recipientId;
	if (fields.description != null) {
		transaction['#description'] = fields.description;
	}
	const wallTime = Date.now();
	await Promise.all([
		// The blob expires after the read window; both parties reference the same id until then.
		shard.data.set(blobKey(id), write(transaction), { px: kTransactionWindow }),
		reference(shard, senderId, 'outgoing', wallTime, id),
		reference(shard, recipientId, 'incoming', wallTime, id),
		getTransactionChannel(shard, senderId).publish({ type: 'updated' }),
		getTransactionChannel(shard, recipientId).publish({ type: 'updated' }),
	]);
}

// -- User credits --

// Stored on the user info hash
const userCreditsField = 'credits';

// User credit balance in millicredits; `Game.market.credits` divides by 1000.
export async function loadUserCredits(shard: Shard, userId: string) {
	return Number(await shard.db.data.hGet(User.infoKey(userId), userCreditsField)) || 0;
}

// Apply `delta` to the user's credit balance. Returns `true` on success or `false` if the user's
// credits would have been decremented below zero.
export async function incrementUserCredits(shard: Shard, userId: string, amount: number) {
	if (amount < 0) {
		const [ , delta ] = await shard.db.data.hIncrByEx(User.infoKey(userId), userCreditsField, amount, { lBound: 0 });
		return delta === amount;
	} else {
		await shard.db.data.hincrBy(User.infoKey(userId), userCreditsField, amount);
		return true;
	}
}

// -- Order book --

// Every order, scored by wall-clock creation time
const allOrdersKey = 'market/orders';

// Active orders, as a plain set
const activeOrdersKey = 'market/orders/active';

// A user's own orders, as a plain set
const userOrdersKey = (userId: string) => `user/${userId}/market/orders`;

// Schema blob for a market order
const orderBlobKey = (id: string) => `market/order/${id}`;

// Global market channel which receives events for market changes
export const marketChannel = (shard: Shard): MarketChannel => new Channel(shard.pubsub, 'market/orders');
type MarketChannel = Channel<
	{ type: 'inserted'; id: string; userId: string } |
	{ type: 'removed'; id: string; userId?: string } |
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
		() => shard.data.get(orderBlobKey(id), { blob: true }),
		blob => shard.data.set(orderBlobKey(id), blob),
		upgradeOrder,
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
		marketChannel(shard).publish({ type: 'updated', id: orderId, amount }),
	]);
}

// Deletes the order blob and index fields. No refund takes place.
export function deleteOrder(shard: Shard, orderId: string, userId?: string) {
	return Promise.all([
		marketChannel(shard).publish({ type: 'removed', id: orderId }),
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
			shard.db.data.hincrBy(User.infoKey(order['#user']), userCreditsField, refund),
		deleteOrder(shard, order.id, order['#user']),
	]);
}

// Return all order ids whose wall time have exceeded the lifetime window.
export async function expiredOrders(shard: Shard) {
	return shard.data.zRange(allOrdersKey, 0, Date.now() - C.MARKET_ORDER_LIFE_TIME, { by: 'SCORE' });
}
