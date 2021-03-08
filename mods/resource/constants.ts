import type { ResourceType } from './resource';
import * as Construction from 'xxscreeps/mods/construction/constants';

// Add `Container` construction cost constant
Construction.CONSTRUCTION_COST.container = 5000;
declare module 'xxscreeps/mods/construction/constants' {
	interface ConstructionCost {
		container: 5000;
	}
}

export const CONTAINER_HITS = 250000;
export const CONTAINER_CAPACITY = 2000;
export const CONTAINER_DECAY = 5000;
export const CONTAINER_DECAY_TIME = 100;
export const CONTAINER_DECAY_TIME_OWNED = 500;

export const ENERGY_DECAY = 1000;

export const LOOK_ENERGY = 'energy' as const;
export const LOOK_RESOURCES = 'resource' as const;

export const RESOURCE_ENERGY = 'energy' as const;
export const RESOURCE_POWER = 'power' as const;
export const RESOURCES_ALL: ResourceType[] = [ RESOURCE_ENERGY, RESOURCE_POWER ];
