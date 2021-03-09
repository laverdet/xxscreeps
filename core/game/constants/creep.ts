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
export const HARVEST_MINERAL_POWER = 1;
export const HARVEST_DEPOSIT_POWER = 1;
export const REPAIR_POWER = 100;
export const DISMANTLE_POWER = 50;
export const UPGRADE_CONTROLLER_POWER = 1;
export const REPAIR_COST = 0.01;
export const DISMANTLE_COST = 0.005;

export const TOMBSTONE_DECAY_PER_PART = 5;
export const TOMBSTONE_DECAY_POWER_CREEP = 500;

export const POWER_LEVEL_MULTIPLY = 1000;
export const POWER_LEVEL_POW = 2;
export const POWER_CREEP_SPAWN_COOLDOWN = 8 * 3600 * 1000;
export const POWER_CREEP_DELETE_COOLDOWN = 24 * 3600 * 1000;
export const POWER_CREEP_MAX_LEVEL = 25;
export const POWER_CREEP_LIFE_TIME = 5000;
export const POWER_CLASS = {
	OPERATOR: 'operator',
};

export const PWR_GENERATE_OPS = 1;
export const PWR_OPERATE_SPAWN = 2;
export const PWR_OPERATE_TOWER = 3;
export const PWR_OPERATE_STORAGE = 4;
export const PWR_OPERATE_LAB = 5;
export const PWR_OPERATE_EXTENSION = 6;
export const PWR_OPERATE_OBSERVER = 7;
export const PWR_OPERATE_TERMINAL = 8;
export const PWR_DISRUPT_SPAWN = 9;
export const PWR_DISRUPT_TOWER = 10;
export const PWR_DISRUPT_SOURCE = 11;
export const PWR_SHIELD = 12;
export const PWR_REGEN_SOURCE = 13;
export const PWR_REGEN_MINERAL = 14;
export const PWR_DISRUPT_TERMINAL = 15;
export const PWR_OPERATE_POWER = 16;
export const PWR_FORTIFY = 17;
export const PWR_OPERATE_CONTROLLER = 18;
export const PWR_OPERATE_FACTORY = 19;

export const EFFECT_INVULNERABILITY = 1001;
export const EFFECT_COLLAPSE_TIMER = 1002;

export const POWER_INFO = {
	[PWR_GENERATE_OPS]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 50,
		effect: [ 1, 2, 4, 6, 8 ],
	},
	[PWR_OPERATE_SPAWN]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 300,
		duration: 1000,
		range: 3,
		ops: 100,
		effect: [ 0.9, 0.7, 0.5, 0.35, 0.2 ],
	},
	[PWR_OPERATE_TOWER]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 10,
		duration: 100,
		range: 3,
		ops: 10,
		effect: [ 1.1, 1.2, 1.3, 1.4, 1.5 ],
	},
	[PWR_OPERATE_STORAGE]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 800,
		duration: 1000,
		range: 3,
		ops: 100,
		effect: [ 500000, 1000000, 2000000, 4000000, 7000000 ],
	},
	[PWR_OPERATE_LAB]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 50,
		duration: 1000,
		range: 3,
		ops: 10,
		effect: [ 2, 4, 6, 8, 10 ],
	},
	[PWR_OPERATE_EXTENSION]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 50,
		range: 3,
		ops: 2,
		effect: [ 0.2, 0.4, 0.6, 0.8, 1.0 ],
	},
	[PWR_OPERATE_OBSERVER]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 400,
		duration: [ 200, 400, 600, 800, 1000 ],
		range: 3,
		ops: 10,
	},
	[PWR_OPERATE_TERMINAL]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 500,
		duration: 1000,
		range: 3,
		ops: 100,
		effect: [ 0.9, 0.8, 0.7, 0.6, 0.5 ],
	},
	[PWR_DISRUPT_SPAWN]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 5,
		range: 20,
		ops: 10,
		duration: [ 1, 2, 3, 4, 5 ],
	},
	[PWR_DISRUPT_TOWER]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 0,
		duration: 5,
		range: 50,
		ops: 10,
		effect: [ 0.9, 0.8, 0.7, 0.6, 0.5 ],
	},
	[PWR_DISRUPT_SOURCE]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 100,
		range: 3,
		ops: 100,
		duration: [ 100, 200, 300, 400, 500 ],
	},
	[PWR_SHIELD]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		effect: [ 5000, 10000, 15000, 20000, 25000 ],
		duration: 50,
		cooldown: 20,
		energy: 100,
	},
	[PWR_REGEN_SOURCE]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 10, 11, 12, 14, 22 ],
		cooldown: 100,
		duration: 300,
		range: 3,
		effect: [ 50, 100, 150, 200, 250 ],
		period: 15,
	},
	[PWR_REGEN_MINERAL]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 10, 11, 12, 14, 22 ],
		cooldown: 100,
		duration: 100,
		range: 3,
		effect: [ 2, 4, 6, 8, 10 ],
		period: 10,
	},
	[PWR_DISRUPT_TERMINAL]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 20, 21, 22, 23, 24 ],
		cooldown: 8,
		duration: 10,
		range: 50,
		ops: [ 50, 40, 30, 20, 10 ],

	},
	[PWR_FORTIFY]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 5,
		range: 3,
		ops: 5,
		duration: [ 1, 2, 3, 4, 5 ],
	},
	[PWR_OPERATE_POWER]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 10, 11, 12, 14, 22 ],
		cooldown: 800,
		range: 3,
		duration: 1000,
		ops: 200,
		effect: [ 1, 2, 3, 4, 5 ],
	},
	[PWR_OPERATE_CONTROLLER]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 20, 21, 22, 23, 24 ],
		cooldown: 800,
		range: 3,
		duration: 1000,
		ops: 200,
		effect: [ 10, 20, 30, 40, 50 ],
	},
	[PWR_OPERATE_FACTORY]: {
		className: POWER_CLASS.OPERATOR,
		level: [ 0, 2, 7, 14, 22 ],
		cooldown: 800,
		range: 3,
		duration: 1000,
		ops: 100,
	},
};
