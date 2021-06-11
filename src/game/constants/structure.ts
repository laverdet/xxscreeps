export const STRUCTURE_PORTAL = 'portal' as const;
export const STRUCTURE_OBSERVER = 'observer' as const;
export const STRUCTURE_POWER_BANK = 'powerBank' as const;
export const STRUCTURE_POWER_SPAWN = 'powerSpawn' as const;
export const STRUCTURE_NUKER = 'nuker' as const;
export const STRUCTURE_FACTORY = 'factory' as const;
export const STRUCTURE_INVADER_CORE = 'invaderCore' as const;

export const OBSERVER_HITS = 500;
export const OBSERVER_RANGE = 10;

export const POWER_BANK_HITS = 2000000;
export const POWER_BANK_CAPACITY_MAX = 5000;
export const POWER_BANK_CAPACITY_MIN = 500;
export const POWER_BANK_CAPACITY_CRIT = 0.3;
export const POWER_BANK_DECAY = 5000;
export const POWER_BANK_HIT_BACK = 0.5;

export const POWER_SPAWN_HITS = 5000;
export const POWER_SPAWN_ENERGY_CAPACITY = 5000;
export const POWER_SPAWN_POWER_CAPACITY = 100;
export const POWER_SPAWN_ENERGY_RATIO = 50;

export const NUKER_HITS = 1000;
export const NUKER_COOLDOWN = 100000;
export const NUKER_ENERGY_CAPACITY = 300000;
export const NUKER_GHODIUM_CAPACITY = 5000;
export const NUKE_LAND_TIME = 50000;
export const NUKE_RANGE = 10;
export const NUKE_DAMAGE = [ 10000000, undefined, 5000000 ];

export const FACTORY_HITS = 1000;
export const FACTORY_CAPACITY = 50000;

export const RUIN_DECAY = 500;
export const RUIN_DECAY_STRUCTURES = {
	powerBank: 10,
};

export const STRONGHOLD_RAMPART_HITS = [ 0, 100000, 200000, 500000, 1000000, 2000000 ];
export const STRONGHOLD_DECAY_TICKS = 75000;
