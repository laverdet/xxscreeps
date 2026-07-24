import { CONSTRUCTION_COST } from 'xxscreeps/mods/classic/construction/constants.js';

CONSTRUCTION_COST.nuker = 100000;

export const FIND_NUKES = 117 as const;
export const LOOK_NUKES = 'nuke' as const;

export const NUKER_HITS = 1000;
export const NUKER_COOLDOWN = 100000;
export const NUKER_ENERGY_CAPACITY = 300000;
export const NUKER_GHODIUM_CAPACITY = 5000;
export const NUKE_LAND_TIME = 50000;
export const NUKE_RANGE = 10;
// Divergence from Screeps, which defines it as `{ 0: 10000000, 2: 5000000 }` for some reason
export const NUKE_DAMAGE = [ 10000000, 5000000, 5000000 ] as const;

export const STRUCTURE_NUKER = 'nuker' as const;
