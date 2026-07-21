import type { UserBrokerageChannel } from './model.js';
import type { TransactionPayload } from './transaction.js';
import type { DeferListener, MessageFor } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { DisposableResource, disposableToEffect, getOrSet } from 'xxscreeps/utility/utility.js';
import { kReadLimit, loadTransactionBlob, loadTransactionEntries, userBrokerageChannel } from './model.js';
import { read } from './transaction.js';

// Transaction blobs are immutable and their ids are globally unique, so cache them by id: a
// transfer referenced by both parties' runtimes is read once and handed out as the same
// SharedArrayBuffer.
// TODO: Expire after the timeout
const loadBlob = function() {
	const cache = new Map<string, Promise<Readonly<Uint8Array>>>();
	return (shard: Shard, id: string) =>
		getOrSet(cache, id, () => loadTransactionBlob(shard, id));
}();

// Watch player transactions
class PlayerBrokerageWatcher extends DisposableResource {
	seen = false;
	readonly incomingIds;
	readonly outgoingIds;

	private constructor(
		disposable: DisposableStack,
		incomingIds: string[],
		outgoingIds: string[],
		listen: DeferListener<MessageFor<UserBrokerageChannel>>,
	) {
		super(disposable);
		this.incomingIds = incomingIds;
		this.outgoingIds = outgoingIds;
		const trim = (list: string[]) => {
			if (list.length > kReadLimit) {
				list.pop();
			}
		};
		listen(event => {
			this.seen = false;
			switch (event.type) {
				case 'incoming':
					this.incomingIds.unshift(event.transactionId);
					trim(this.incomingIds);
					break;
				case 'outgoing':
					this.outgoingIds.unshift(event.transactionId);
					trim(this.outgoingIds);
					break;
			}
		});
	}

	static async create(shard: Shard, userId: string) {
		using disposable = new DisposableStack();
		const channel = userBrokerageChannel(shard, userId);
		const subscription = disposable.use(await channel.subscribe());
		const listen = subscription.listenDeferred();
		const transactions = await loadTransactionEntries(shard, userId);
		const { incoming, outgoing } = transactions;
		return new PlayerBrokerageWatcher(disposable.move(), incoming, outgoing, listen);
	}

	check() {
		if (this.seen) {
			return false;
		} else {
			this.seen = true;
			return true;
		}
	}
}

hooks.register('runnerConnector', async player => {
	// The runner connector will maintain up to 100 transactions per direction. The initial load only
	// selects transactions from the last 24 hours. So a "hard reset" causes an effective trim in the
	// player's transaction view.
	using disposable = new DisposableStack();
	const brokerage = disposable.use(await PlayerBrokerageWatcher.create(player.shard, player.userId));
	let loadedBlobs = new Set<string>();
	return [ disposableToEffect(disposable.move()), {
		initialize() {
			loadedBlobs.clear();
			brokerage.seen = false;
		},

		async refresh(payload) {
			if (brokerage.check()) {
				const { incomingIds, outgoingIds } = brokerage;
				const currentIds = new Set(Fn.concat<string>([ incomingIds, outgoingIds ]));
				const blobs = await Fn.mapAwait(
					currentIds.difference(loadedBlobs),
					async id => [ id, await loadBlob(player.shard, id) ] as const);
				loadedBlobs = currentIds;
				for (const blob of blobs) {
					const transaction = read(blob[1]);
					(payload.userIds ??= []).push(transaction['#sender'], transaction['#recipient']);
				}
				payload.transactions = {
					blobs,
					incomingIds: [ ...incomingIds ],
					outgoingIds: [ ...outgoingIds ],
				};
			}
		},
	} ];
});

// ---

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		transactions?: TransactionPayload;
	}
}
