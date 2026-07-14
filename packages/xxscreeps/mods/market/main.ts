import { registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { deleteOrder, expireOrder, expiredOrders, loadAndReadMarketOrder } from './model.js';

// Expires expired orders, or deletes orphaned orders.
registerShardTickProcessor(async shard => {
	const expired = await expiredOrders(shard);
	await Fn.mapAwait(expired, async id => {
		const order = await loadAndReadMarketOrder(shard, id);
		if (order) {
			await expireOrder(shard, order);
		} else {
			await deleteOrder(shard, id);
		}
	});
});
