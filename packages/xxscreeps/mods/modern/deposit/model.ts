import { makeDueSet } from 'xxscreeps/engine/processor/shard.js';

// Score = wall-clock ms when this sector should be re-evaluated (0 = immediately), member = central
// room name (e.g. `W5N5`). One row per sector, regardless of how many highway rooms it owns.
export const dueSectors = makeDueSet('deposits/dueSectors');
