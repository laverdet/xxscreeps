export const FIND_CREEPS = 101 as const;
export const FIND_MY_CREEPS = 102 as const;
export const FIND_HOSTILE_CREEPS = 103 as const;
export const LOOK_CREEPS = 'creep' as const;

export const MOVE = 'move' as const;
export const WORK = 'work' as const;
export const CARRY = 'carry' as const;
export const ATTACK = 'attack' as const;
export const RANGED_ATTACK = 'ranged_attack' as const;
export const TOUGH = 'tough' as const;
export const HEAL = 'heal' as const;
export const CLAIM = 'claim' as const;

export const MAX_CREEP_SIZE = 50;

export const BODYPART_COST = {
	'move': 50,
	'work': 100,
	'attack': 80,
	'carry': 50,
	'heal': 250,
	'ranged_attack': 150,
	'tough': 10,
	'claim': 600,
};
export const BODYPARTS_ALL = [ MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, TOUGH, HEAL, CLAIM ];

export const CREEP_LIFE_TIME = 1500;
export const CREEP_CLAIM_LIFE_TIME = 600;
export const CREEP_CORPSE_RATE = 0.2;
export const CREEP_PART_MAX_ENERGY = 125;

export const CARRY_CAPACITY = 50;

export const TOMBSTONE_DECAY_PER_PART = 5;
export const TOMBSTONE_DECAY_POWER_CREEP = 500;
