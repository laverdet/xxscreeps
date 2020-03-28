export const STRUCTURE_SPAWN = 'spawn' as const;
export const STRUCTURE_EXTENSION = 'extension' as const;
export const STRUCTURE_ROAD = 'road' as const;
export const STRUCTURE_WALL = 'constructedWall' as const;
export const STRUCTURE_RAMPART = 'rampart' as const;
export const STRUCTURE_KEEPER_LAIR = 'keeperLair' as const;
export const STRUCTURE_PORTAL = 'portal' as const;
export const STRUCTURE_CONTROLLER = 'controller' as const;
export const STRUCTURE_LINK = 'link' as const;
export const STRUCTURE_STORAGE = 'storage' as const;
export const STRUCTURE_TOWER = 'tower' as const;
export const STRUCTURE_OBSERVER = 'observer' as const;
export const STRUCTURE_POWER_BANK = 'powerBank' as const;
export const STRUCTURE_POWER_SPAWN = 'powerSpawn' as const;
export const STRUCTURE_EXTRACTOR = 'extractor' as const;
export const STRUCTURE_LAB = 'lab' as const;
export const STRUCTURE_TERMINAL = 'terminal' as const;
export const STRUCTURE_CONTAINER = 'container' as const;
export const STRUCTURE_NUKER = 'nuker' as const;
export const STRUCTURE_FACTORY = 'factory' as const;
export const STRUCTURE_INVADER_CORE = 'invaderCore' as const;

export const MAX_CONSTRUCTION_SITES = 100;

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

export const ENERGY_REGEN_TIME = 300;
export const ENERGY_DECAY = 1000;

export const SPAWN_HITS = 5000;
export const SPAWN_ENERGY_START = 300;
export const SPAWN_ENERGY_CAPACITY = 300;
export const CREEP_SPAWN_TIME = 3;
export const SPAWN_RENEW_RATIO = 1.2;

export const WALL_HITS = 1;
export const WALL_HITS_MAX = 300000000;

export const EXTENSION_HITS = 1000;
export const EXTENSION_ENERGY_CAPACITY = [ 50, 50, 50, 50, 50, 50, 50, 100, 200 ];

export const ROAD_HITS = 5000;
export const ROAD_WEAROUT = 1;
export const ROAD_WEAROUT_POWER_CREEP = 100;
export const ROAD_DECAY_AMOUNT = 100;
export const ROAD_DECAY_TIME = 1000;

export const LINK_HITS = 1000;
export const LINK_HITS_MAX = 1000;
export const LINK_CAPACITY = 800;
export const LINK_COOLDOWN = 1;
export const LINK_LOSS_RATIO = 0.03;

export const STORAGE_CAPACITY = 1000000;
export const STORAGE_HITS = 10000;

export const CONSTRUCTION_COST = {
	'spawn': 15000,
	'extension': 3000,
	'road': 300,
	'constructedWall': 1,
	'rampart': 1,
	'link': 5000,
	'storage': 30000,
	'tower': 5000,
	'observer': 8000,
	'powerSpawn': 100000,
	'extractor': 5000,
	'lab': 50000,
	'terminal': 100000,
	'container': 5000,
	'nuker': 100000,
	'factory': 100000,
};

export const CONSTRUCTION_COST_ROAD_SWAMP_RATIO = 5;
export const CONSTRUCTION_COST_ROAD_WALL_RATIO = 150;

export const CONTROLLER_LEVELS = [ undefined, 200, 45000, 135000, 405000, 1215000, 3645000, 10935000 ];
export const CONTROLLER_STRUCTURES = {
	'spawn': [ 0, 1, 1, 1, 1, 1, 1, 2, 3 ],
	'extension': [ 0, 0, 5, 10, 20, 30, 40, 50, 60 ],
	'link': [ 0, 0, 0, 0, 0, 2, 3, 4, 6 ],
	'road': [ 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500 ],
	'constructedWall': [ 0, 0, 2500, 2500, 2500, 2500, 2500, 2500, 2500 ],
	'rampart': [ 0, 0, 2500, 2500, 2500, 2500, 2500, 2500, 2500 ],
	'storage': [ 0, 0, 0, 0, 1, 1, 1, 1, 1 ],
	'tower': [ 0, 0, 0, 1, 1, 2, 2, 3, 6 ],
	'observer': [ 0, 0, 0, 0, 0, 0, 0, 0, 1 ],
	'powerSpawn': [ 0, 0, 0, 0, 0, 0, 0, 0, 1 ],
	'extractor': [ 0, 0, 0, 0, 0, 0, 1, 1, 1 ],
	'terminal': [ 0, 0, 0, 0, 0, 0, 1, 1, 1 ],
	'lab': [ 0, 0, 0, 0, 0, 0, 3, 6, 10 ],
	'container': [ 5, 5, 5, 5, 5, 5, 5, 5, 5 ],
	'nuker': [ 0, 0, 0, 0, 0, 0, 0, 0, 1 ],
	'factory': [ 0, 0, 0, 0, 0, 0, 0, 1, 1 ],
};
export const CONTROLLER_DOWNGRADE = [ undefined, 20000, 10000, 20000, 40000, 80000, 120000, 150000, 200000 ];
export const CONTROLLER_DOWNGRADE_RESTORE = 100;
export const CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD = 5000;
export const CONTROLLER_CLAIM_DOWNGRADE = 300;
export const CONTROLLER_RESERVE = 1;
export const CONTROLLER_RESERVE_MAX = 5000;
export const CONTROLLER_MAX_UPGRADE_PER_TICK = 15;
export const CONTROLLER_ATTACK_BLOCKED_UPGRADE = 1000;
export const CONTROLLER_NUKE_BLOCKED_UPGRADE = 200;

export const SAFE_MODE_DURATION = 20000;
export const SAFE_MODE_COOLDOWN = 50000;
export const SAFE_MODE_COST = 1000;

export const TOWER_HITS = 3000;
export const TOWER_CAPACITY = 1000;
export const TOWER_ENERGY_COST = 10;
export const TOWER_POWER_ATTACK = 600;
export const TOWER_POWER_HEAL = 400;
export const TOWER_POWER_REPAIR = 800;
export const TOWER_OPTIMAL_RANGE = 5;
export const TOWER_FALLOFF_RANGE = 20;
export const TOWER_FALLOFF = 0.75;

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

export const EXTRACTOR_HITS = 500;
export const EXTRACTOR_COOLDOWN = 5;

export const LAB_HITS = 500;
export const LAB_MINERAL_CAPACITY = 3000;
export const LAB_ENERGY_CAPACITY = 2000;
export const LAB_BOOST_ENERGY = 20;
export const LAB_BOOST_MINERAL = 30;
export const LAB_COOLDOWN = 10;
export const LAB_REACTION_AMOUNT = 5;
export const LAB_UNBOOST_ENERGY = 0;
export const LAB_UNBOOST_MINERAL = 15;

export const TERMINAL_CAPACITY = 300000;
export const TERMINAL_HITS = 3000;
export const TERMINAL_SEND_COST = 0.1;
export const TERMINAL_MIN_SEND = 100;
export const TERMINAL_COOLDOWN = 10;

export const CONTAINER_HITS = 250000;
export const CONTAINER_CAPACITY = 2000;
export const CONTAINER_DECAY = 5000;
export const CONTAINER_DECAY_TIME = 100;
export const CONTAINER_DECAY_TIME_OWNED = 500;

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
	'powerBank': 10,
};

export const INVADER_CORE_HITS = 100000;
export const INVADER_CORE_CREEP_SPAWN_TIME = [ 0, 0, 6, 3, 2, 1 ];
export const INVADER_CORE_EXPAND_TIME = [ undefined, 4000, 3500, 3000, 2500, 2000 ];
export const INVADER_CORE_CONTROLLER_POWER = 2;
export const INVADER_CORE_CONTROLLER_DOWNGRADE = 5000;

export const STRONGHOLD_RAMPART_HITS = [ 0, 100000, 200000, 500000, 1000000, 2000000 ];
export const STRONGHOLD_DECAY_TICKS = 75000;
