import { makeDueSet } from 'xxscreeps/engine/processor/shard.js';

// Score = wall-clock ms when the center rooms are next swept for a missing pair. One row, since the
// pair target belongs to the whole world rather than to any one room.
export const dueSweep = makeDueSet('portals/dueSweep');
