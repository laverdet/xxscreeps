import type { OrderType } from './order.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { ResourceType } from 'xxscreeps/mods/resource/resource.js';
import 'xxscreeps:mods/game';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { UpdateSchemaBlob, loadUpgradedWithWriteBack } from 'xxscreeps/engine/schema/keyval.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { initializeView } from 'xxscreeps/schema/read.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { Order, format as orderFormat } from './order.js';
import { Transaction, upgrade, write } from './transaction.js';

// Building the order schema resolves `resourceEnumFormat`, which closes the ResourceType extension
// path — the `xxscreeps:mods/game` import above guarantees every mod's schema registration has run.
// The eager build also archives the schema package before the first player sandbox snapshots it.
const { offsetOf, read: readOrder, version: orderSchemaVersion, write: writeOrder } = makeReaderAndWriter(orderFormat);
// `amount` is recomputed nearly every tick, so the maintenance pass patches it in place through
// `UpdateSchemaBlob` instead of rewriting the blob.
const offsetOfAmount = offsetOf('MarketOrder', 'amount');

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

// Market order book. Each order is normalized into its own namespace: the order is stored once as a
// mutable blob at `market/order/<id>` and referenced by id from `market/orders` (every order, scored
// by wall-clock creation time so the expiry sweep reads only due ids), `market/orders/active` (the
// player-visible book), `user/<id>/market/orders` (one user's own orders), and the owning terminal's
// `#orderIds`. The owning terminal's room pass maintains its orders' state, so a room-object write
// path owns each order; every write publishes the changed ids so runner caches invalidate without
// polling. Prices and the `money` balance are stored in millicredits; the runtime `Market` and the
// `Order.price` getter divide by 1000 at the read boundary.
const moneyField = 'money';
const allOrdersKey = 'market/orders';
const activeOrdersKey = 'market/orders/active';
const orderBlobKey = (id: string) => `market/order/${id}`;
const userOrdersKey = (userId: string) => `user/${userId}/market/orders`;

// Order writers publish the ids they touched; the runner invalidates its blob cache and resends the
// ids to affected runtimes.
export function getOrderChannel(shard: Shard) {
	return new Channel<{ type: 'updated' | 'removed'; ids: string[] }>(shard.pubsub, 'market/orders');
}

export function loadOrderBlob(shard: Shard, id: string) {
	return shard.data.get(orderBlobKey(id), { blob: true });
}

// A blob stored under a foreign schema version can't be read by the runtime, so it ships as
// missing; the owning terminal's room pass removes the order when it encounters one.
export async function loadShippableOrderBlob(shard: Shard, id: string) {
	const blob = await loadOrderBlob(shard, id);
	return blob !== null && initializeView(blob).version === orderSchemaVersion ? blob : null;
}

export function loadActiveOrderIds(shard: Shard) {
	return shard.data.sMembers(activeOrdersKey);
}

export function loadUserOrderIds(shard: Shard, userId: string) {
	return shard.data.sMembers(userOrdersKey(userId));
}

// Overlaid order blobs by id; an unreadable (missing or foreign-version) blob resolves undefined.
export function loadOrdersById(shard: Shard, ids: string[]) {
	return Fn.mapAwait(ids, async id => {
		const blob = await loadOrderBlob(shard, id);
		if (blob === null || initializeView(blob).version !== orderSchemaVersion) {
			return;
		}
		return readOrder(blob);
	});
}

// The whole book, overlaid. Unreadable blobs are dropped.
export async function loadOrders(shard: Shard): Promise<Order[]> {
	const ids = await shard.data.zRange(allOrdersKey, -Infinity, Infinity, { by: 'SCORE' });
	return [ ...Fn.filter(await loadOrdersById(shard, ids)) ];
}

// User credit balance in millicredits; `Game.market.credits` divides by 1000.
export async function loadMoney(shard: Shard, userId: string) {
	const money = await shard.db.data.hGet(User.infoKey(userId), moneyField);
	return Number(money) || 0;
}

// Debit the listing fee, refunding when the balance went negative or the user is at the order cap —
// the debit-then-check keeps concurrent order creation from overdrawing without a lock. The cap
// check is advisory under cross-room concurrency; the fee is the hard limit.
export async function chargeListingFee(shard: Shard, userId: string, fee: number) {
	const [ balance, orderCount ] = await Promise.all([
		shard.db.data.hincrBy(User.infoKey(userId), moneyField, -fee),
		shard.data.sCard(userOrdersKey(userId)),
	]);
	if (balance < 0 || orderCount >= C.MARKET_MAX_ORDERS) {
		await shard.db.data.hincrBy(User.infoKey(userId), moneyField, fee);
		return false;
	}
	return true;
}

export interface NewOrderFields {
	type: OrderType;
	resourceType: ResourceType;
	price: number;
	totalAmount: number;
	roomName: string;
	created: number;
}

// Write a new order and index it. The order is written inactive; the owning terminal's next room
// pass activates it. Returns the new order's id for the terminal to anchor.
export async function insertOrder(shard: Shard, userId: string, fields: NewOrderFields) {
	const id = Id.generateId();
	const order = assign(new Order(), {
		id,
		type: fields.type,
		resourceType: fields.resourceType,
		totalAmount: fields.totalAmount,
		remainingAmount: fields.totalAmount,
		roomName: fields.roomName,
		created: fields.created,
		createdTimestamp: Date.now(),
	});
	// `#` fields are assigned through member access so the isolated-vm private transform rewrites them.
	order['#price'] = fields.price;
	order['#user'] = userId;
	await Promise.all([
		shard.data.set(orderBlobKey(id), writeOrder(order)),
		shard.data.zAdd(allOrdersKey, [ [ order.createdTimestamp, id ] ]),
		shard.data.sAdd(userOrdersKey(userId), [ id ]),
		getOrderChannel(shard).publish({ type: 'updated', ids: [ id ] }),
	]);
	return id;
}

// Rewrite a changed order, keeping the active-book index in step with its `active` flag (the set ops
// are idempotent, so no before/after comparison is needed).
export function saveOrder(shard: Shard, order: Order) {
	const id = order.id;
	return Promise.all([
		shard.data.set(orderBlobKey(id), writeOrder(order)),
		order.active ? shard.data.sAdd(activeOrdersKey, [ id ]) : shard.data.sRem(activeOrdersKey, [ id ]),
		getOrderChannel(shard).publish({ type: 'updated', ids: [ id ] }),
	]);
}

// Patch the advertised volume in place — the common case as stock and credits fluctuate.
export function patchOrderAmount(shard: Shard, id: string, amount: number) {
	return Promise.all([
		shard.data.eval(UpdateSchemaBlob, [ orderBlobKey(id) ],
			[ orderSchemaVersion, offsetOfAmount, 'int32', amount, 'set' ]),
		getOrderChannel(shard).publish({ type: 'updated', ids: [ id ] }),
	]);
}

// Free an order: drop the blob and every index that referenced it. The owning terminal's `#orderIds`
// entry is left to dangle; its room pass prunes ids whose blob is gone.
export function removeOrder(shard: Shard, order: Order) {
	const id = order.id;
	return Promise.all([
		shard.data.del(orderBlobKey(id)),
		shard.data.zRem(allOrdersKey, [ id ]),
		shard.data.sRem(activeOrdersKey, [ id ]),
		shard.data.sRem(userOrdersKey(order['#user']), [ id ]),
		getOrderChannel(shard).publish({ type: 'removed', ids: [ id ] }),
	]);
}

// Drop an unreadable (missing or foreign-schema-version) order outright — the refund price is
// inside the blob, so there is nothing to give back. The caller supplies the probable owner when it
// knows one (the anchoring terminal's user); otherwise that user's order-set entry is left to
// dangle, and readers tolerate it.
export function removeUnreadableOrder(shard: Shard, id: string, userId?: string | null) {
	return Promise.all([
		shard.data.del(orderBlobKey(id)),
		shard.data.zRem(allOrdersKey, [ id ]),
		shard.data.sRem(activeOrdersKey, [ id ]),
		...userId == null ? [] : [ shard.data.sRem(userOrdersKey(userId), [ id ]) ],
		getOrderChannel(shard).publish({ type: 'removed', ids: [ id ] }),
	]);
}

// Expire an aged order, refunding the unspent share of the listing fee.
export async function expireOrder(shard: Shard, order: Order) {
	const refund = Math.floor(order.remainingAmount * order['#price'] * C.MARKET_FEE);
	if (refund > 0) {
		await shard.db.data.hincrBy(User.infoKey(order['#user']), moneyField, refund);
	}
	await removeOrder(shard, order);
}

// Expiry backstop, run once per tick by the market shard pass without loading any room: the owning
// terminal's room pass expires its own orders, so this only catches orders whose room never
// processes (terminal destroyed, room asleep). The creation-time score selects due ids without
// reading blobs.
export async function expireOrphanedOrders(shard: Shard) {
	const due = await shard.data.zRange(allOrdersKey, 0, Date.now() - C.MARKET_ORDER_LIFE_TIME, { by: 'SCORE' });
	await Fn.mapAwait(due, async id => {
		const [ order ] = await loadOrdersById(shard, [ id ]);
		if (order) {
			await expireOrder(shard, order);
		} else {
			await removeUnreadableOrder(shard, id);
		}
	});
}
