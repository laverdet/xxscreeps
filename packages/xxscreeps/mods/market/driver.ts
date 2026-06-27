import type { OrderPayload } from './order.js';
import type { TransactionPayload } from './transaction.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { getTransactionChannel, loadActiveOrderIds, loadMoney, loadOrderBlob, loadTransactionBlob, loadTransactionEntries, loadUserOrderIds } from './model.js';
import { read } from './transaction.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		transactions?: TransactionPayload;
		// The active public order book plus this user's own orders, as shared unparsed blobs by id.
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

// Orders are mutable across ticks but stable within one (the market shard-tick pass is the only
// writer and reads are tick-synchronized), so the active book's id list and every order blob are
// read once per (shard, tick) and shared across this runner process's player instances: the book is
// identical for every player, and an active order that is also one of yours is read once.
interface OrderCache {
	time: number;
	active: Promise<string[]>;
	blobs: Map<string, Promise<Readonly<Uint8Array> | null>>;
}

const orderCaches = new WeakMap<Shard, OrderCache>();
function orderCacheFor(shard: Shard, time: number) {
	let cache = orderCaches.get(shard);
	if (cache?.time !== time) {
		cache = { time, active: loadActiveOrderIds(shard), blobs: new Map() };
		orderCaches.set(shard, cache);
	}
	return cache;
}

hooks.register('runnerConnector', player => [ undefined, {
	async refresh(payload) {
		const cache = orderCacheFor(player.shard, payload.time);
		const [ active, mine, money ] = await Promise.all([
			cache.active,
			loadUserOrderIds(player.shard, player.userId),
			loadMoney(player.shard, player.userId),
		]);
		const ids = [ ...new Set([ ...active, ...mine ]) ];
		// An id can outlive its blob (the shard pass removes orders between the id-set read and this
		// fetch), so missing blobs are dropped here and the runtime filters the id lists against them.
		const entries = await Fn.mapAwait(ids, async id => {
			const blob = await getOrSet(cache.blobs, id, () => loadOrderBlob(player.shard, id));
			return blob && ([ id, blob ] as const);
		});
		payload.orders = { active, mine, blobs: Fn.fromEntries(Fn.filter(entries)) };
		payload.money = money;
	},
} ]);
