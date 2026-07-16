export const POWER_BANK_HITS = 2000000;
export const POWER_BANK_CAPACITY_MAX = 5000;
export const POWER_BANK_CAPACITY_MIN = 500;
export const POWER_BANK_CAPACITY_CRIT = 0.3;
export const POWER_BANK_DECAY = 5000;
export const POWER_BANK_HIT_BACK = 0.5;

export const RUIN_DECAY = 500;
export const RUIN_DECAY_STRUCTURES: Record<string, number> = {
	powerBank: 10,
};

export const STRONGHOLD_RAMPART_HITS = [ 0, 100000, 200000, 500000, 1000000, 2000000 ];
export const STRONGHOLD_DECAY_TICKS = 75000;
