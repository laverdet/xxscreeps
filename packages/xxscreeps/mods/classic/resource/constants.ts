import type { ResourceType } from './resource.js';
import { CONSTRUCTION_COST } from 'xxscreeps/mods/classic/construction/constants.js';

CONSTRUCTION_COST.container = 5000;

export const CONTAINER_HITS = 250000;
export const CONTAINER_CAPACITY = 2000;
export const CONTAINER_DECAY = 5000;
export const CONTAINER_DECAY_TIME = 100;
export const CONTAINER_DECAY_TIME_OWNED = 500;

export const ENERGY_DECAY = 1000;

export const EVENT_TRANSFER = 12;

export const FIND_DROPPED_RESOURCES = 106 as const;

export const LOOK_ENERGY = 'energy' as const;
export const LOOK_RESOURCES = 'resource' as const;

export const RESOURCE_ENERGY = 'energy' as const;
export const RESOURCES_ALL: ResourceType[] = [ RESOURCE_ENERGY ];

export const STRUCTURE_CONTAINER = 'container' as const;
