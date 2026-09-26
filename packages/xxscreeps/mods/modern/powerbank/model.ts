import { makeDueSet } from 'xxscreeps/engine/processor/shard.js';

// Score = the tick a room is next due, member = highway room name. One row per room, rebuilt on
// restart from each room's persisted `#nextPowerBankTime`.
export const dueRooms = makeDueSet('powerbanks/dueRooms');
