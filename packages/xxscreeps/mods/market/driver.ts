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
	const channel = await getTransactionChannel(player.shard, player.userId).subscribe();
	let dirty = true;
	channel.listen(() => { dirty = true; });
	let entries: ReturnType<typeof loadTransactionEntries> | undefined;
	return [ () => channel.disconnect(), {
		async refresh(payload) {
			if (dirty) {
				dirty = false;
				entries = loadTransactionEntries(player.shard, player.userId);
			}
			const { incoming, outgoing } = await entries!;
			// Re-apply the window every tick so transfers age out without a reload.
			const cutoff = Date.now() - kTransactionWindow;
			const incomingIds = selectRecent(incoming, cutoff);
			const outgoingIds = selectRecent(outgoing, cutoff);
			const ids = [ ...new Set([ ...incomingIds, ...outgoingIds ]) ];
			const blobList = await Promise.all(ids.map(id => loadBlob(player.shard, id)));
			// Ask the runner to resolve the parties' usernames for the read-time getters.
			const parties = new Set<string>();
			for (const blob of blobList) {
				const transaction = read(blob);
				parties.add(transaction['#sender']);
				parties.add(transaction['#recipient']);
			}
			(payload.userIds ??= []).push(...parties);
			const blobs = Object.fromEntries(ids.map((id, index) => [ id, blobList[index]! ]));
			payload.transactions = { incoming: incomingIds, outgoing: outgoingIds, blobs };
		},
	} ];
});
