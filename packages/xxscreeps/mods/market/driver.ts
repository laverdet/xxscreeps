import type { TransactionPayload } from './transaction.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { loadTransactionBlob, loadTransactionRefs } from './model.js';
import { read } from './transaction.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		transactions?: TransactionPayload;
	}
}

// Transaction blobs are immutable, so cache them by id per (shard, tick): a transfer referenced by
// both parties' runtimes is read once and handed out as the same SharedArrayBuffer.
const blobCache = new WeakMap<Shard, { time: number; blobs: Map<string, Promise<Readonly<Uint8Array>>> }>();
function loadBlobOnce(shard: Shard, time: number, id: string) {
	let cache = blobCache.get(shard);
	if (cache?.time !== time) {
		cache = { time, blobs: new Map() };
		blobCache.set(shard, cache);
	}
	let blob = cache.blobs.get(id);
	if (blob === undefined) {
		blob = loadTransactionBlob(shard, id);
		cache.blobs.set(id, blob);
	}
	return blob;
}

hooks.register('runnerConnector', player => [ undefined, {
	async refresh(payload) {
		const { incoming, outgoing } = await loadTransactionRefs(player.shard, player.userId);
		const ids = [ ...new Set([ ...incoming, ...outgoing ]) ];
		const blobList = await Promise.all(ids.map(id => loadBlobOnce(player.shard, payload.time, id)));
		// Resolve every party so the read-time `sender` / `recipient` getters find a username.
		const parties = new Set<string>();
		for (const blob of blobList) {
			const transaction = read(blob);
			parties.add(transaction['#sender']);
			parties.add(transaction['#recipient']);
		}
		const usernames = Object.fromEntries(await Promise.all([ ...parties ].map(async userId =>
			[ userId, (await player.shard.db.data.hGet(User.infoKey(userId), 'username'))! ] as const)));
		const blobs = Object.fromEntries(ids.map((id, index) => [ id, blobList[index]! ]));
		payload.transactions = { incoming, outgoing, blobs, usernames };
	},
} ]);
