import type { ConstructionCost } from 'xxscreeps:mods/game';

export const CONSTRUCTION_COST: ConstructionCost = {} as never;

export const BUILD_POWER = 5;
export const REPAIR_POWER = 100;
export const DISMANTLE_POWER = 50;

export const REPAIR_COST = 0.01;
export const DISMANTLE_COST = 0.005;

export const EVENT_BUILD = 4;
export const EVENT_REPAIR = 7;

export const FIND_CONSTRUCTION_SITES = 111 as const;
export const FIND_MY_CONSTRUCTION_SITES = 114 as const;
export const FIND_HOSTILE_CONSTRUCTION_SITES = 115 as const;

export const LOOK_CONSTRUCTION_SITES = 'constructionSite' as const;

export const MAX_CONSTRUCTION_SITES = 100;
