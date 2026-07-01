import type { TransactionPayload } from './transaction.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { getTransactionChannel, kTransactionWindow, loadTransactionBlob, loadTransactionEntries, selectRecent } from './model.js';
import { read } from './transaction.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		transactions?: TransactionPayload;
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
			const cutoff = Date.now() - kTransactionWindow;
			const incomingIds = selectRecent(incoming, cutoff);
			const outgoingIds = selectRecent(outgoing, cutoff);
			const ids = [ ...new Set([ ...incomingIds, ...outgoingIds ]) ];
			const blobList = await Promise.all(ids.map(id => loadBlob(player.shard, id)));
			// Contribute both parties of every transfer; the runner resolves and dedupes the ids.
			for (const blob of blobList) {
				const transaction = read(blob);
				(payload.userIds ??= []).push(transaction['#sender'], transaction['#recipient']);
			}
			const blobs = Object.fromEntries(ids.map((id, index) => [ id, blobList[index]! ]));
			payload.transactions = { incoming: incomingIds, outgoing: outgoingIds, blobs };
		},
	} ];
});
