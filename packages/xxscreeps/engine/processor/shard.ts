import type { ShardInitializer, ShardTickProcessor } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { shardInitializers, shardTickProcessors } from './symbols.js';

export function registerShardTickProcessor(tick: ShardTickProcessor) {
	shardTickProcessors.push(tick);
}

// Runs once when a shard's services start, before the first tick. For one-time per-shard setup
// (e.g. seeding a periodic-sweep schedule) that the steady-state tick should never re-check.
export function registerShardInitializer(initializer: ShardInitializer) {
	shardInitializers.push(initializer);
}

export async function runShardInitializers(shard: Shard) {
	await Promise.all(shardInitializers.map(fn => fn(shard)));
}

export const everyNTicks = (period: number, fn: ShardTickProcessor): ShardTickProcessor =>
	(shard, time) => {
		if (time % period === 0) {
			return fn(shard, time);
		}
	};

export async function runShardTickProcessors(shard: Shard, time: number) {
	await Fn.mapAwait(shardTickProcessors, fn => fn(shard, time));
}
