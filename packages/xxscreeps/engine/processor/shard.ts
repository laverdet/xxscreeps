import type { ShardTickProcessor } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { shardTickProcessors } from './symbols.js';

export function registerShardTickProcessor(tick: ShardTickProcessor) {
	shardTickProcessors.push(tick);
}

export const everyNTicks = (period: number, fn: ShardTickProcessor): ShardTickProcessor =>
	shard => {
		if (shard.time % period === 0) {
			return fn(shard);
		}
	};

export async function runShardTickProcessors(shard: Shard) {
	await Promise.all(shardTickProcessors.map(fn => fn(shard)));
}
