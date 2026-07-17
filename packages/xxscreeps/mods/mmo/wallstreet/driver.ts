import type { MarketChannel, UserCreditsChannel } from './model.js';
import type { OrderPayload } from './order.js';
import type { DeferListener, MessageFor, SubscriptionFor } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { acquireWith } from 'xxscreeps/utility/async.js';
import { DisposableResource, disposableToEffect, getOrSet, maybeRemoveOne } from 'xxscreeps/utility/utility.js';
import { activeOrdersKey, loadMarketOrderBlob, loadMarketOrderIds, loadUserCredits, marketChannel, userCreditsChannel, userOrdersKey } from './model.js';
import { orderAmountOffsetOf } from './order.js';

// Caches market order blobs between ticks. Also, listens for update events and updates `amount` on
// changed payloads.
class OrderBlobWatcherLoader extends DisposableResource {
	readonly blobs = new Map<string, Readonly<Uint8Array>>();
	changedThisTick = new Set<string>();
	private readonly shard;
	private pendingBlobs = new Map<string, Promise<Readonly<Uint8Array>>>();
	private nextBlobs: [ string, Readonly<Uint8Array> ][] = [];
	private time = -1;

	private constructor(disposable: DisposableStack, shard: Shard, subscription: SubscriptionFor<MarketChannel>) {
		super(disposable);
		this.shard = shard;
		disposable.defer(subscription.listen(event => {
			if (event.type === 'updated') {
				const blob = this.blobs.get(event.id);
				if (blob) {
					const next = new Uint8Array(new SharedArrayBuffer(blob.byteLength));
					next.set(blob);
					const dv = new DataView(next.buffer);
					dv.setUint32(orderAmountOffsetOf + 16, event.amount, true);
					this.nextBlobs.push([ event.id, next ]);
				}
			}
		}));
	}

	static async create(shard: Shard) {
		using disposable = new DisposableStack();
		const channel = marketChannel(shard);
		const subscription = disposable.use(await channel.subscribe());
		return new OrderBlobWatcherLoader(disposable.move(), shard, subscription);
	}

	load(id: string) {
		return this.blobs.get(id) ?? getOrSet(this.pendingBlobs, id, async () => {
			const blob = await loadMarketOrderBlob(this.shard, id);
			if (blob) {
				this.blobs.set(id, blob);
			}
			return blob;
		});
	}

	tick(time: number) {
		if (this.time !== time) {
			this.time = time;
			this.changedThisTick = new Set();
			this.pendingBlobs = new Map();
			for (const [ id, blob ] of this.nextBlobs) {
				this.blobs.set(id, blob);
				this.changedThisTick.add(id);
			}
			this.nextBlobs = [];
		}
	}
}

// Watch the user's credit balance
class PlayerCreditsWatcher extends DisposableResource {
	credits;

	private constructor(disposable: DisposableStack, credits: number, listen: DeferListener<MessageFor<UserCreditsChannel>>) {
		super(disposable);
		this.credits = credits;
		listen(event => {
			if (event.type === 'changed') {
				this.credits += event.amount;
			}
		});
	}

	static async create(shard: Shard, userId: string) {
		using disposable = new DisposableStack();
		const channel = userCreditsChannel(shard, userId);
		const subscription = disposable.use(await channel.subscribe());
		const listen = subscription.listenDeferred();
		const credits = await loadUserCredits(shard, userId);
		return new PlayerCreditsWatcher(disposable.move(), Number(credits) || 0, listen);
	}
}

// Watch the player's active & inactive orders
class PlayerOrderWatcher extends DisposableResource {
	readonly userId;
	readonly orderIds;

	private constructor(
		disposable: DisposableStack,
		userId: string,
		orderIds: string[],
		listen: DeferListener<MessageFor<MarketChannel>>,
	) {
		super(disposable);
		this.userId = userId;
		this.orderIds = orderIds;
		listen(event => {
			// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
			switch (event.type) {
				case 'inserted':
					if (event.userId === this.userId) {
						this.orderIds.unshift(event.id);
					}
					break;
				case 'removed':
					if (event.userId === this.userId) {
						maybeRemoveOne(this.orderIds, event.id);
					}
					break;
			}
		});
	}

	static async create(shard: Shard, userId: string) {
		using disposable = new DisposableStack();
		const channel = marketChannel(shard);
		const subscription = disposable.use(await channel.subscribe());
		const listen = subscription.listenDeferred();
		const orderIds = await shard.data.sMembers(userOrdersKey(userId));
		return new PlayerOrderWatcher(disposable.move(), userId, orderIds, listen);
	}
}

// Watch the active market order book
class MarketOrderWatcher extends DisposableResource {
	readonly orderIds;
	readonly inactive;

	private constructor(
		disposable: DisposableStack,
		orderIds: string[],
		inactive: Set<string>,
		listen: DeferListener<MessageFor<MarketChannel>>,
	) {
		super(disposable);
		this.orderIds = orderIds;
		this.inactive = inactive;
		listen(event => {
			switch (event.type) {
				case 'inserted':
					this.inactive.add(event.id);
					this.orderIds.unshift(event.id);
					break;

				case 'removed':
					this.inactive.delete(event.id);
					maybeRemoveOne(this.orderIds, event.id);
					break;

				case 'updated':
					if (event.amount === 0) {
						this.inactive.add(event.id);
					} else {
						this.inactive.delete(event.id);
					}
			}
		});
	}

	static async create(shard: Shard) {
		using disposable = new DisposableStack();
		const channel = marketChannel(shard);
		const subscription = disposable.use(await channel.subscribe());
		const listen = subscription.listenDeferred();
		const [ activeOrderIds, allOrderIds ] = await Promise.all([
			shard.data.sMembers(activeOrdersKey),
			loadMarketOrderIds(shard),
		]);
		const inactive = Fn.pipe(
			activeOrderIds,
			$$ => new Set($$),
			$$ => Fn.filter(allOrderIds, id => !$$.has(id)),
			$$ => new Set($$));
		return new MarketOrderWatcher(disposable.move(), allOrderIds, inactive, listen);
	}
}

hooks.register('runnerWorker', async runner =>
	runner.marketWatcher = await MarketOrderWatcher.create(runner.shard));

hooks.register('runnerConnector', async (player, runner) => {
	using disposable = new DisposableStack();
	const { marketWatcher } = runner;
	const [ blobLoader, playerCredits, playerOrders ] = await acquireWith(
		resource => disposable.use(resource),
		OrderBlobWatcherLoader.create(player.shard),
		PlayerCreditsWatcher.create(player.shard, player.userId),
		PlayerOrderWatcher.create(player.shard, player.userId),
	);
	let loadedBlobs = new Set<string>();
	return [ disposableToEffect(disposable.move()), {
		initialize() {
			loadedBlobs.clear();
		},

		async refresh(payload) {
			blobLoader.tick(payload.time);
			payload.credits = playerCredits.credits;
			const activeOrderIds = [ ...Fn.filter(marketWatcher.orderIds, id => !marketWatcher.inactive.has(id)) ];
			const currentIds = new Set(Fn.concat<string>([ playerOrders.orderIds, activeOrderIds ]));
			const blobs = await Fn.pipe(
				currentIds,
				$$ => Fn.filter($$, id => blobLoader.changedThisTick.has(id) || !loadedBlobs.has(id)),
				$$ => new Set($$),
				$$ => Fn.mapAwait($$, async id => [ id, await blobLoader.load(id) ] as const));
			type MaybeBlobEntry = readonly [ string, Readonly<Uint8Array> | null ];
			type FoundBlobEntry = readonly [ string, Readonly<Uint8Array> ];
			loadedBlobs = currentIds;
			payload.marketBook = {
				active: activeOrderIds,
				blobs: blobs.filter(([ , blob ]) => blob) satisfies MaybeBlobEntry[] as FoundBlobEntry[],
				mine: playerOrders.orderIds,
			};
		},
	} ];
});

// ---

declare module 'xxscreeps/engine/runner/index.js' {
	interface RunnerWorker {
		marketWatcher: MarketOrderWatcher;
	}

	interface TickPayload {
		// Credit balance in millicredits; `Market.credits` divides by 1000.
		credits: number;
		// Market book payload
		marketBook?: OrderPayload;
	}
}
