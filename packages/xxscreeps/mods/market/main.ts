import type { CreateOrderParams } from './model.js';
import { registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { acquireNamedIntentsForTick } from 'xxscreeps/engine/processor/model.js';
import { createOrder, loadOrders, runOrderMaintenance } from './model.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent {
		// `market.createOrder` is a per-user named intent: it carries no room, so it has no room
		// processor — registering only its type keeps `intents.pushNamed` strongly checked.
		marketNamed: { type: 'market'; intent: 'createOrder'; data: [ params: CreateOrderParams ] };
	}
}

// The market's global pass. It runs once per tick in `main` (so order/credit mutations are
// serialized): drain this tick's player-global market intents, apply them, then recompute every
// order's activity. The book is snapshotted before the intents run, so an order created this tick is
// not maintained until next tick (it is written inactive and first activates then).
registerShardTickProcessor(async (shard, time) => {
	const orders = await loadOrders(shard);
	for (const { userId, named } of await acquireNamedIntentsForTick(shard, time)) {
		for (const args of named.market?.createOrder ?? []) {
			await createOrder(shard, userId, time, args[0] as CreateOrderParams);
		}
	}
	await runOrderMaintenance(shard, orders);
});
