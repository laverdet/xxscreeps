export const STRUCTURE_RAMPART = 'rampart' as const;
export const STRUCTURE_TOWER = 'tower' as const;
export const STRUCTURE_WALL = 'constructedWall' as const;

export const RAMPART_DECAY_AMOUNT = 300;
export const RAMPART_DECAY_TIME = 100;
export const RAMPART_HITS = 1;
export const RAMPART_HITS_MAX = [
	undefined,
	undefined,
	300000,
	1000000,
	3000000,
	10000000,
	30000000,
	100000000,
	300000000,
];

export const TOWER_HITS = 3000;
export const TOWER_CAPACITY = 1000;
export const TOWER_ENERGY_COST = 10;
export const TOWER_POWER_ATTACK = 600;
export const TOWER_POWER_HEAL = 400;
export const TOWER_POWER_REPAIR = 800;
export const TOWER_OPTIMAL_RANGE = 5;
export const TOWER_FALLOFF_RANGE = 20;
export const TOWER_FALLOFF = 0.75;

export const WALL_HITS = 1;
export const WALL_HITS_MAX = 300000000;
