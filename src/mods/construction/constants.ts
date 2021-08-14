const consts = {
	spawn: 15000,
	extension: 3000,
	road: 300,
	constructedWall: 1,
	container: 5000,
	rampart: 1,
	link: 5000,
	storage: 30000,
	tower: 5000,
	observer: 8000,
	powerSpawn: 100000,
	extractor: 5000,
	lab: 50000,
	terminal: 100000,
	nuker: 100000,
	factory: 100000,
} as const;

export interface ConstructionCost {}
export const CONSTRUCTION_COST: ConstructionCost & typeof consts = consts as never;

export const BUILD_POWER = 5;
export const REPAIR_POWER = 100;
export const DISMANTLE_POWER = 50;

export const REPAIR_COST = 0.01;
export const DISMANTLE_COST = 0.005;

export const FIND_CONSTRUCTION_SITES = 111 as const;
export const FIND_MY_CONSTRUCTION_SITES = 114 as const;
export const FIND_HOSTILE_CONSTRUCTION_SITES = 115 as const;

export const LOOK_CONSTRUCTION_SITES = 'constructionSite' as const;

export const MAX_CONSTRUCTION_SITES = 100;
