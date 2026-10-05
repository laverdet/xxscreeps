import type { ShardInitializer, ShardTickProcessor } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { GameState } from 'xxscreeps/game/index.js';
import { shardInitializers, shardTickProcessors } from './symbols.js';

export function registerShardTickProcessor(tick: ShardTickProcessor) {
	shardTickProcessors.push(tick);
}

// Runs once when a shard's services start, before the first tick. For one-time per-shard setup
// (e.g. seeding a periodic-sweep schedule) that the steady-state tick should never re-check.
export function registerShardInitializer(initializer: ShardInitializer) {
	shardInitializers.push(initializer);
}

// Shard processors are handed a primordial game state, with the world and the time but no rooms. They
// are asynchronous, so `Game` is not held for them: one that needs it, say for the expiry time of an
// object in a room it loaded, passes this to `runWithState` around the synchronous work that does.
export async function runShardInitializers(shard: Shard, world: World) {
	const state = new GameState(world, shard.time, []);
	await Promise.all(shardInitializers.map(fn => fn(shard, state)));
}

export interface DueSet {
	/** Members due at or before `at`, soonest first. */
	due: (shard: Shard, at: number) => Promise<string[]>;
	/** Overwrite `member`'s due time. `earliest` lowers an existing one instead of replacing it. */
	schedule: (shard: Shard, member: string, dueAt: number, options?: { earliest?: boolean }) => Promise<number>;
	/** Drop `member` from the schedule, leaving it never due until it is scheduled again. */
	cancel: (shard: Shard, member: string) => Promise<number>;
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
		cancel: (shard, member) => shard.scratch.zRem(key, [ member ]),
		seed: (shard, entries) => shard.scratch.zAdd(key, entries),
		entriesForTest: shard => shard.scratch.zRangeWithScores(key, 0, -1),
	};
}

export async function runShardTickProcessors(shard: Shard, world: World, time: number) {
	const state = new GameState(world, time, []);
	await Fn.mapAwait(shardTickProcessors, fn => fn(shard, state));
}
