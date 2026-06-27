import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { ResourceType } from 'xxscreeps/mods/resource/resource.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { initializeView } from 'xxscreeps/schema/read.js';
import { assign, getOrSet } from 'xxscreeps/utility/utility.js';
import { Order, orderSchemaVersion, read as readOrder, write as writeOrder } from './order.js';
import { Transaction, write } from './transaction.js';

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
	return shard.data.req(blobKey(id), { blob: true });
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
// mutable blob at `market/order/<id>` and referenced by id from three sets — `market/orders` indexes
// every order so the maintenance pass can enumerate them, `market/orders/active` is the player-visible
// book, and `user/<id>/market/orders` is one user's own orders. The market shard-tick pass is the only
// writer, so the per-order writes need no further guarding. Prices and the `money` balance are stored
// in millicredits; the runtime `Market` and the `Order.price` getter divide by 1000 at the read
// boundary.
const moneyField = 'money';
const allOrdersKey = 'market/orders';
const activeOrdersKey = 'market/orders/active';
const orderBlobKey = (id: string) => `market/order/${id}`;
const userOrdersKey = (userId: string) => `user/${userId}/market/orders`;

export type OrderType = typeof C.ORDER_BUY | typeof C.ORDER_SELL;

export function loadOrderBlob(shard: Shard, id: string) {
	return shard.data.get(orderBlobKey(id), { blob: true });
}

export function loadActiveOrderIds(shard: Shard) {
	return shard.data.sMembers(activeOrdersKey);
}

export function loadUserOrderIds(shard: Shard, userId: string) {
	return shard.data.sMembers(userOrdersKey(userId));
}

// Every order, overlaid. Read once per tick by the maintenance pass, which mutates and rewrites only
// the orders whose state changed.
export async function loadOrders(shard: Shard): Promise<Order[]> {
	const ids = await shard.data.sMembers(allOrdersKey);
	const orders = await Fn.mapAwait(ids, async id => {
		// An order whose blob is missing or stored under another schema version is dropped from the
		// book. The owner id is inside the unreadable blob, so the owner's order-set entry is left to
		// dangle (readers tolerate missing blobs) and the listing fee cannot be refunded.
		const blob = await loadOrderBlob(shard, id);
		if (blob === null || initializeView(blob).version !== orderSchemaVersion) {
			await Promise.all([
				shard.data.del(orderBlobKey(id)),
				shard.data.sRem(allOrdersKey, [ id ]),
				shard.data.sRem(activeOrdersKey, [ id ]),
			]);
			return;
		}
		return readOrder(blob);
	});
	return [ ...Fn.filter(orders) ];
}

// Rewrite a changed order, keeping the active-book index in step with its `active` flag (the set ops
// are idempotent, so no before/after comparison is needed).
function saveOrder(shard: Shard, order: Order) {
	const id = order.id;
	return Promise.all([
		shard.data.set(orderBlobKey(id), writeOrder(order)),
		order.active ? shard.data.sAdd(activeOrdersKey, [ id ]) : shard.data.sRem(activeOrdersKey, [ id ]),
	]);
}

// Free an order: drop the blob and every index that referenced it.
function removeOrder(shard: Shard, order: Order) {
	const id = order.id;
	return Promise.all([
		shard.data.del(orderBlobKey(id)),
		shard.data.sRem(allOrdersKey, [ id ]),
		shard.data.sRem(activeOrdersKey, [ id ]),
		shard.data.sRem(userOrdersKey(order['#user']), [ id ]),
	]);
}

// User credit balance in millicredits; `Game.market.credits` divides by 1000.
export function loadMoney(shard: Shard, userId: string) {
	return shard.db.data.hGet(User.infoKey(userId), moneyField).then(money => Number(money) || 0);
}

// Shape of a `createOrder` named intent. Fields are untrusted (they arrive over JSON from the
// runtime), so `createOrder` validates each before use.
export interface CreateOrderParams {
	type: string;
	resourceType: string;
	price: number;
	totalAmount: number;
	roomName: string;
}

// Authoritative createOrder: re-validates game state (the runtime validated too) and, when it holds,
// charges the listing fee and writes the order. Returns the new order, or undefined when rejected — a
// stale intent whose game state no longer qualifies is silently dropped. The order is written
// inactive; the next maintenance pass activates it (see `runOrderMaintenance`).
export async function createOrder(shard: Shard, userId: string, time: number, params: CreateOrderParams) {
	const { type, resourceType, roomName } = params;
	const price = Math.round(params.price);
	const totalAmount = Math.floor(params.totalAmount);
	if (type !== C.ORDER_BUY && type !== C.ORDER_SELL) {
		return;
	}
	if (!(C.RESOURCES_ALL as string[]).includes(resourceType) || !(price > 0) || !(totalAmount > 0)) {
		return;
	}
	// A non-intershard order requires a terminal the player owns in `roomName`. Full initialization
	// is needed so the room's objects are instantiated and `terminal` resolves. `roomName` is
	// unvalidated, so the room may simply not exist — a failed load rejects the intent like any other.
	const room = await shard.loadRoom(roomName).catch(() => undefined);
	if (room?.terminal?.['#user'] !== userId) {
		return;
	}
	const fee = Math.ceil(price * totalAmount * C.MARKET_FEE);
	const [ money, orderCount ] = await Promise.all([
		loadMoney(shard, userId),
		shard.data.sCard(userOrdersKey(userId)),
	]);
	if (orderCount >= C.MARKET_MAX_ORDERS || money < fee) {
		return;
	}
	await shard.db.data.hincrBy(User.infoKey(userId), moneyField, -fee);
	const id = Id.generateId();
	const order = assign(new Order(), {
		id,
		type,
		resourceType: resourceType as ResourceType,
		totalAmount,
		remainingAmount: totalAmount,
		roomName,
		created: time,
		createdTimestamp: Date.now(),
	});
	// `#` fields are assigned through member access so the isolated-vm private transform rewrites them.
	order['#price'] = price;
	order['#user'] = userId;
	// `amount`/`active` default to 0/false, so the order is written inactive.
	await Promise.all([
		shard.data.set(orderBlobKey(id), writeOrder(order)),
		shard.data.sAdd(allOrdersKey, [ id ]),
		shard.data.sAdd(userOrdersKey(userId), [ id ]),
	]);
	return order;
}

// Run once per tick by the market shard-tick pass over the book snapshot taken before this tick's new
// orders were created — so a brand-new order is first seen here next tick. Expires aged orders,
// refunding the unspent listing fee, then recomputes each surviving order's `active`/`amount` from the
// owner's current terminal holdings (sell) or affordable volume bounded by terminal free space (buy).
// Only orders whose state actually changed are rewritten.
export async function runOrderMaintenance(shard: Shard, orders: Order[]) {
	const now = Date.now();
	const rooms = new Map<string, Promise<Room>>();
	const loadRoomOnce = (roomName: string) => getOrSet(rooms, roomName, () => shard.loadRoom(roomName));
	for (const order of orders) {
		if (now - order.createdTimestamp > C.MARKET_ORDER_LIFE_TIME) {
			const refund = Math.floor(order.remainingAmount * order['#price'] * C.MARKET_FEE);
			if (refund > 0) {
				await shard.db.data.hincrBy(User.infoKey(order['#user']), moneyField, refund);
			}
			await removeOrder(shard, order);
			continue;
		}
		const { terminal } = await loadRoomOnce(order.roomName);
		const myTerminal = terminal?.['#user'] === order['#user'] ? terminal : undefined;
		let active: boolean;
		let amount: number;
		if (order.type === C.ORDER_SELL) {
			const available = Math.min(myTerminal?.store.getUsedCapacity(order.resourceType) ?? 0, order.remainingAmount);
			active = available > 0;
			amount = active ? available : 0;
		} else {
			// A buy order's advertised volume tracks the owner's credits even while the order is
			// inactive, and any terminal in the room bounds it by free space.
			const affordable = Math.floor(await loadMoney(shard, order['#user']) / order['#price']);
			amount = Math.min(affordable, order.remainingAmount, terminal?.store.getFreeCapacity() ?? Infinity);
			active = myTerminal !== undefined && amount > 0;
		}
		if (order.active !== active || order.amount !== amount) {
			order.active = active;
			order.amount = amount;
			await saveOrder(shard, order);
		}
	}
}
