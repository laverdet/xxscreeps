import type { Shard } from 'xxscreeps/engine/db/index.js';
import { makeDueSet } from 'xxscreeps/engine/processor/shard.js';

// Wall time, in ms, of the next portal sweep. There is only one member because a single sweep covers
// the whole world. The member is removed while no sweep is scheduled.
const dueSweep = makeDueSet('portals/dueSweep');
const kSweepMember = 'world';

// True if the sweep should run at wall time `now`.
export async function isSweepDue(shard: Shard, now: number) {
	const due = await dueSweep.due(shard, now);
	return due.length !== 0;
}

// Sets the wall time of the next sweep, replacing any time already scheduled. `Infinity` leaves no
// sweep scheduled.
export async function scheduleSweep(shard: Shard, time: number) {
	if (time === Infinity) {
		await dueSweep.cancel(shard, kSweepMember);
	} else {
		await dueSweep.schedule(shard, kSweepMember, time);
	}
}

// Makes the sweep run on the current tick, whatever time it was scheduled for.
export async function requestSweep(shard: Shard) {
	await dueSweep.schedule(shard, kSweepMember, 0, { earliest: true });
}

export async function sweepTimesForTesting(shard: Shard) {
	const entries = await dueSweep.entriesForTest(shard);
	return entries.map(([ time ]) => time);
}
