import type { Shard } from 'xxscreeps/engine/db/index.js';

// Sorted set in scratch (rebuildable on restart — it's fine to drop wall time): score = wall-clock
// ms when this sector should be re-evaluated (0 = immediately), member = central room name (e.g.
// `W5N5`). One row per sector, regardless of how many highway rooms it owns.
const dueSectorsKey = 'deposits/dueSectors';

// `{ earliest: true }` only lowers an existing score (the decay path, freeing throughput);
// otherwise the score is overwritten (the evaluator pushing the next check forward).
export function scheduleSector(shard: Shard, sector: string, dueAt: number, options?: { earliest?: boolean }) {
	return shard.scratch.zAdd(dueSectorsKey, [ [ dueAt, sector ] ],
		options?.earliest === true ? { up: 'LT' } : undefined);
}

// Seed a batch of sectors, staggered by their scatter offsets. `up: 'LT'` keeps a re-seed (a fresh
// service start over surviving scratch) from clobbering sectors a prior run already advanced.
export function seedSectors(shard: Shard, seeds: [ score: number, sector: string ][]) {
	return shard.scratch.zAdd(dueSectorsKey, seeds, { up: 'LT' });
}

// Central rooms due for re-evaluation at or before `now`.
export function dueSectorsAt(shard: Shard, now: number) {
	return shard.scratch.zRange(dueSectorsKey, 0, now, { by: 'SCORE' });
}
