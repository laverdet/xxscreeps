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

export interface DueSet {
	/** Members due at or before `at`, soonest first. */
	due: (shard: Shard, at: number) => Promise<string[]>;
	/** Overwrite `member`'s due time. `earliest` lowers an existing one instead of replacing it. */
	schedule: (shard: Shard, member: string, dueAt: number, options?: { earliest?: boolean }) => Promise<number>;
	/** Seed a batch at startup. */
	seed: (shard: Shard, entries: [ score: number, member: string ][]) => Promise<number>;
	/** @internal Lets a spec read the schedule without knowing the key shape. */
	entriesForTest: (shard: Shard) => Promise<[ score: number, member: string ][]>;
}

/**
 * A due schedule for a shard-tick processor that sweeps something periodically: score = when the
 * member is next due, member = the room or sector it stands for. `at` and the scores share whatever
 * clock the caller sweeps on, wall-clock or tick.
 *
 * It lives in `scratch` because it is rebuildable — a schedule reshuffled by a restart violates
 * nothing, and `main` flushes scratch before running the shard initializer that seeds it.
 */
export function makeDueSet(key: string): DueSet {
	return {
		due: (shard, at) => shard.scratch.zRange(key, 0, at, { by: 'SCORE' }),
		schedule: (shard, member, dueAt, options) =>
			shard.scratch.zAdd(key, [ [ dueAt, member ] ], options?.earliest === true ? { up: 'LT' } : undefined),
		seed: (shard, entries) => shard.scratch.zAdd(key, entries),
		entriesForTest: shard => shard.scratch.zRangeWithScores(key, 0, -1),
	};
}

export async function runShardTickProcessors(shard: Shard, time: number) {
	await Fn.mapAwait(shardTickProcessors, fn => fn(shard, time));
}
