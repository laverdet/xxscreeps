import type { ShardTickProcessor } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { shardTickProcessors } from './symbols.js';

export function registerShardTickProcessor(tick: ShardTickProcessor) {
	shardTickProcessors.push(tick);
}

export const everyNTicks = (period: number, fn: ShardTickProcessor): ShardTickProcessor =>
	(shard, time) => {
		if (time % period === 0) {
			return fn(shard, time);
		}
	};

export async function runShardTickProcessors(shard: Shard, time: number) {
	await Promise.all(shardTickProcessors.map(fn => fn(shard, time)));
}
