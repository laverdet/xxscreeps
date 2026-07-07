import type { OrderPayload } from './order.js';
import type { TransactionPayload } from './transaction.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { getOrderChannel, getTransactionChannel, loadActiveOrderIds, loadMoney, loadShippableOrderBlob, loadTransactionBlob, loadTransactionEntries, loadUserOrderIds } from './model.js';
import { read } from './transaction.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		transactions?: TransactionPayload;
		// The active public order book plus this user's own orders; blobs carry only the orders that
		// changed since this runtime's last tick.
		orders?: OrderPayload;
		// Credit balance in millicredits; `Market.credits` divides by 1000.
		money?: number;
	}
}

// Transaction blobs are immutable and their ids are globally unique, so cache them by id: a transfer
// referenced by both parties' runtimes is read once and handed out as the same SharedArrayBuffer.
const loadBlob = function() {
	const cache = new Map<string, Promise<Readonly<Uint8Array>>>();
	return (shard: Shard, id: string) =>
		getOrSet(cache, id, () => loadTransactionBlob(shard, id));
}();

hooks.register('runnerConnector', async player => {
	// The processor publishes here whenever a transfer touches the user. Reload and resend only then;
	// on quiet ticks the runtime keeps the last payload it was sent, so aged-out transfers linger
	// until the next transfer rewindows the list.
	// TODO: Players making heavy use of the market could benefit from only receiving new transaction
	// blobs.
	const channel = await getTransactionChannel(player.shard, player.userId).subscribe();
	let dirty = true;
	channel.listen(() => { dirty = true; });
	return [ () => channel.disconnect(), {
		// A fresh sandbox (first tick, or after a code reset) holds no transactions; resend next tick.
		initialize() { dirty = true; },
		async refresh(payload) {
			if (!dirty) {
				return;
			}
			dirty = false;
			const { incoming, outgoing } = await loadTransactionEntries(player.shard, player.userId);
			const ids = [ ...incoming, ...outgoing ];
			const blobList = await Fn.mapAwait(ids, id => loadBlob(player.shard, id));
			for (const blob of blobList) {
				const transaction = read(blob);
				(payload.userIds ??= []).push(transaction['#sender'], transaction['#recipient']);
			}
			const blobs = Fn.fromEntries(ids, (id, index) => [ id, blobList[index]! ]);
			payload.transactions = { incoming, outgoing, blobs };
		},
	} ];
});

// Order blobs are mutable, so they are cached across ticks and invalidated by the order channel:
// writers publish every id they touch, and each player's subscription both drops the shared cache
// entry and marks the id for resend to that runtime. The book is identical for every player, so a
// changed order is read once per process and shipped only to runtimes that see it.
const orderBlobs = new Map<string, Promise<Readonly<Uint8Array> | null>>();
const loadOrderBlobCached = (shard: Shard, id: string) =>
	getOrSet(orderBlobs, id, () => loadShippableOrderBlob(shard, id));

// The active book's id list is read once per tick and shared across this process's players.
const loadActiveIdsForTick = function() {
	let cache: { time: number; active: Promise<string[]> } | undefined;
	return (shard: Shard, time: number) => {
		if (cache?.time !== time) {
			cache = { time, active: loadActiveOrderIds(shard) };
		}
		return cache.active;
	};
}();

hooks.register('runnerConnector', async player => {
	const channel = await getOrderChannel(player.shard).subscribe();
	// The whole visible book ships on the runtime's first tick; afterwards only dirty ids.
	let fresh = true;
	const dirty = new Set<string>();
	channel.listen(message => {
		for (const id of message.ids) {
			orderBlobs.delete(id);
			dirty.add(id);
		}
	});
	return [ () => channel.disconnect(), {
		initialize() {
			fresh = true;
			// Orders may have changed while no subscription in this process was listening; the fresh
			// runtime re-reads the book, so drop the cache rather than serve possibly-stale buffers.
			orderBlobs.clear();
		},
		async refresh(payload) {
			// Snapshot before any await: an update published while this refresh is in flight stays
			// marked and ships next tick.
			const taken = [ ...dirty ];
			dirty.clear();
			const wasFresh = fresh;
			fresh = false;
			const [ active, mine, money ] = await Promise.all([
				loadActiveIdsForTick(player.shard, payload.time),
				loadUserOrderIds(player.shard, player.userId),
				loadMoney(player.shard, player.userId),
			]);
			const members = new Set([ ...active, ...mine ]);
			const wanted = wasFresh ? members : Fn.filter(taken, id => members.has(id));
			// An id can outlive its blob (removed between the id-set read and this fetch), so missing
			// blobs are dropped here and the runtime filters the id lists against them.
			const entries = await Fn.mapAwait(wanted, async id => {
				const blob = await loadOrderBlobCached(player.shard, id);
				return blob && ([ id, blob ] as const);
			});
			payload.orders = { active, mine, blobs: Fn.fromEntries(Fn.filter(entries)) };
			payload.money = money;
		},
	} ];
});
