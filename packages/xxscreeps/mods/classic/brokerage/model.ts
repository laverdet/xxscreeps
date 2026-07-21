import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { loadUpgradedWithWriteBack } from 'xxscreeps/engine/schema/keyval.js';
import { Transaction, upgrade, write } from './transaction.js';

// A terminal transfer is normalized: stored once as an immutable schema blob at
// `market/transaction/<id>` and referenced by id from each party's per-direction sorted set, scored
// by wall-clock time. The blob carries a `px` TTL so it self-frees after the read window; the set
// entries are score-trimmed to the same window. Both parties' runtimes are handed the same blob.
const kTransactionWindow = 24 * 60 * 60 * 1000;
// `incomingTransactions` / `outgoingTransactions` expose the most recent transfers, capped at the
// smaller of the 24h window or this count.
/** @internal */
export const kReadLimit = 100;

type Direction = 'incoming' | 'outgoing';

const blobKey = (id: string) => `market/transaction/${id}`;
const setKey = (userId: string, direction: Direction) => `user/${userId}/market/transactions/${direction}`;

// Channel for user transactions
export const userBrokerageChannel =
	(shard: Shard, userId: string): UserBrokerageChannel => new Channel(shard.pubsub, `user/${userId}/brokerage`);

export type UserBrokerageChannel = Channel<
	{ type: 'incoming'; transactionId: string } |
	{ type: 'outgoing'; transactionId: string }
>;

export function loadTransactionBlob(shard: Shard, id: string) {
	return loadUpgradedWithWriteBack(
		shard.db,
		upgrade,
		() => shard.data.req(blobKey(id), { blob: true }),
		blob => shard.data.set(blobKey(id), blob),
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

export async function recordTransaction(shard: Shard, senderId: string, recipientId: string, transaction: Transaction) {
	const id = transaction.transactionId = Id.generateId();
	transaction['#sender'] = senderId;
	transaction['#recipient'] = recipientId;
	const wallTime = Date.now();
	await Promise.all([
		// The blob expires after the read window; both parties reference the same id until then.
		shard.data.set(blobKey(id), write(transaction), { px: kTransactionWindow }),
		reference(shard, senderId, 'outgoing', wallTime, id),
		reference(shard, recipientId, 'incoming', wallTime, id),
		userBrokerageChannel(shard, senderId).publish({ type: 'outgoing', transactionId: id }),
		userBrokerageChannel(shard, recipientId).publish({ type: 'incoming', transactionId: id }),
	]);
}
