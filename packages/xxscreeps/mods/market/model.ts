import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { ResourceType } from 'xxscreeps/mods/resource/resource.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { Transaction, write } from './transaction.js';

// Terminal transfers are normalized: each is stored once as an immutable blob at
// `market/transaction/<id>` and referenced from each party's per-direction list. A list entry is
// `<createdMs>|<id>` — the timestamp gates the 24h read window, the id dereferences the blob. A list
// keeps at most `kMaxTransactions` ids (newest last); a transfer is referenced by exactly two lists
// when recorded, so `market/transactionRefs` counts the live references and the blob is freed once
// both parties have evicted it.
const kMaxTransactions = 100;
export const kTransactionWindow = 24 * 60 * 60 * 1000;

type Direction = 'incoming' | 'outgoing';

const blobKey = (id: string) => `market/transaction/${id}`;
const listKey = (userId: string, direction: Direction) => `user/${userId}/market/transactions/${direction}`;
const refsKey = 'market/transactionRefs';
const idFromEntry = (entry: string) => entry.slice(entry.indexOf('|') + 1);

export interface TransactionFields {
	time: number;
	resourceType: ResourceType;
	amount: number;
	from: string;
	to: string;
	description?: string | undefined;
}

export function loadTransactionBlob(shard: Shard, id: string) {
	return shard.data.req(blobKey(id), { blob: true });
}

async function dropReference(shard: Shard, id: string) {
	// One list no longer references this transfer; free the blob once neither party does.
	if (await shard.data.hincrBy(refsKey, id, -1) <= 0) {
		await Promise.all([
			shard.data.hDel(refsKey, [ id ]),
			shard.data.del(blobKey(id)),
		]);
	}
}

async function pushReference(shard: Shard, userId: string, direction: Direction, entry: string) {
	const key = listKey(userId, direction);
	// One push adds one entry, so at most one is over the cap. Pop a single oldest; trimming by
	// `length - kMaxTransactions` over-evicts when concurrent pushes each observe a racing length.
	if (await shard.data.rPush(key, [ entry ]) > kMaxTransactions) {
		const evicted = await shard.data.lPop(key);
		if (evicted !== null) {
			await dropReference(shard, idFromEntry(evicted));
		}
	}
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
	// `#` fields are assigned through member access so the isolated-vm private transform rewrites them.
	transaction['#sender'] = senderId;
	transaction['#recipient'] = recipientId;
	if (fields.description != null) {
		transaction['#description'] = fields.description;
	}
	const entry = `${Date.now()}|${id}`;
	await Promise.all([
		shard.data.set(blobKey(id), write(transaction)),
		shard.data.hincrBy(refsKey, id, 2),
		pushReference(shard, senderId, 'outgoing', entry),
		pushReference(shard, recipientId, 'incoming', entry),
	]);
}

async function loadDirection(shard: Shard, userId: string, direction: Direction, cutoff: number) {
	const entries = await shard.data.lRange(listKey(userId, direction), -kMaxTransactions, -1);
	// Newest-first, dropping anything older than the 24h window.
	return entries
		.filter(entry => Number(entry.slice(0, entry.indexOf('|'))) >= cutoff)
		.map(idFromEntry)
		.reverse();
}

export async function loadTransactionRefs(shard: Shard, userId: string) {
	const cutoff = Date.now() - kTransactionWindow;
	const [ incoming, outgoing ] = await Promise.all([
		loadDirection(shard, userId, 'incoming', cutoff),
		loadDirection(shard, userId, 'outgoing', cutoff),
	]);
	return { incoming, outgoing };
}
