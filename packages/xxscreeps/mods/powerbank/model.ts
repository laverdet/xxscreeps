import type { Shard } from 'xxscreeps/engine/db/index.js';

// Sorted set in scratch (rebuilt on restart from each room's persisted `#nextPowerBankTime`): score =
// the tick a room is next due, member = highway room name. One row per room.
const dueRoomsKey = 'powerbanks/dueRooms';

// Overwrites a room's next-due score; shared by the reschedule and tests.
export function scheduleRoom(shard: Shard, roomName: string, dueAt: number) {
	return shard.scratch.zAdd(dueRoomsKey, [ [ dueAt, roomName ] ]);
}

// Seed a batch of rooms at startup. `up: 'LT'` keeps a re-seed (a fresh service start over surviving
// scratch) from clobbering a room a prior run already advanced.
export function seedRooms(shard: Shard, seeds: [ score: number, roomName: string ][]) {
	return shard.scratch.zAdd(dueRoomsKey, seeds, { up: 'LT' });
}

// Highway rooms due to place at or before `time`.
export function dueRoomsAt(shard: Shard, time: number) {
	return shard.scratch.zRange(dueRoomsKey, 0, time, { by: 'SCORE' });
}

// Test-only accessor so specs don't have to know the redis key shape.
export function inspectDuePowerBankRoomsForTest(shard: Shard): Promise<[ score: number, roomName: string ][]> {
	return shard.scratch.zRangeWithScores(dueRoomsKey, 0, -1);
}
