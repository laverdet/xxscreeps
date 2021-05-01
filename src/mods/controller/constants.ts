export const FIND_MY_STRUCTURES = 108 as const;
export const FIND_HOSTILE_STRUCTURES = 109 as const;

export const STRUCTURE_CONTROLLER = 'controller' as const;

export const UPGRADE_CONTROLLER_POWER = 1;

export const CONTROLLER_LEVELS = [ undefined, 200, 45000, 135000, 405000, 1215000, 3645000, 10935000 ];
export const CONTROLLER_STRUCTURES = {
	spawn: [ 0, 1, 1, 1, 1, 1, 1, 2, 3 ],
	extension: [ 0, 0, 5, 10, 20, 30, 40, 50, 60 ],
	link: [ 0, 0, 0, 0, 0, 2, 3, 4, 6 ],
	road: [ 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500 ],
	constructedWall: [ 0, 0, 2500, 2500, 2500, 2500, 2500, 2500, 2500 ],
	rampart: [ 0, 0, 2500, 2500, 2500, 2500, 2500, 2500, 2500 ],
	storage: [ 0, 0, 0, 0, 1, 1, 1, 1, 1 ],
	tower: [ 0, 0, 0, 1, 1, 2, 2, 3, 6 ],
	observer: [ 0, 0, 0, 0, 0, 0, 0, 0, 1 ],
	powerSpawn: [ 0, 0, 0, 0, 0, 0, 0, 0, 1 ],
	extractor: [ 0, 0, 0, 0, 0, 0, 1, 1, 1 ],
	terminal: [ 0, 0, 0, 0, 0, 0, 1, 1, 1 ],
	lab: [ 0, 0, 0, 0, 0, 0, 3, 6, 10 ],
	container: [ 5, 5, 5, 5, 5, 5, 5, 5, 5 ],
	nuker: [ 0, 0, 0, 0, 0, 0, 0, 0, 1 ],
	factory: [ 0, 0, 0, 0, 0, 0, 0, 1, 1 ],
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

export const EVENT_ATTACK_CONTROLLER = 3;
export const EVENT_RESERVE_CONTROLLER = 8;
export const EVENT_UPGRADE_CONTROLLER = 9;
