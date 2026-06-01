export const STRUCTURE_PORTAL = 'portal' as const;
export const STRUCTURE_POWER_BANK = 'powerBank' as const;
export const STRUCTURE_POWER_SPAWN = 'powerSpawn' as const;
export const STRUCTURE_NUKER = 'nuker' as const;
export const STRUCTURE_FACTORY = 'factory' as const;
export const STRUCTURE_INVADER_CORE = 'invaderCore' as const;

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

export const FACTORY_HITS = 1000;
export const FACTORY_CAPACITY = 50000;

export const RUIN_DECAY = 500;
export const RUIN_DECAY_STRUCTURES: Record<string, number> = {
	powerBank: 10,
};

export const STRONGHOLD_RAMPART_HITS = [ 0, 100000, 200000, 500000, 1000000, 2000000 ];
export const STRONGHOLD_DECAY_TICKS = 75000;
