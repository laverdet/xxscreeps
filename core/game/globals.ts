import lodash from 'lodash';
import * as C from './constants';
import * as Memory from './memory';
import PathFinder from './path-finder';
import { Flag } from './flag';
import { RoomPosition } from './position';
import { Room } from './room';
import { RoomVisual } from './visual';

import { ConstructionSite } from 'xxscreeps/mods/construction/construction-site';
import { Creep } from './objects/creep';
import { Resource } from 'xxscreeps/mods/resource/resource';
import { RoomObject } from './object';
import { Structure } from './objects/structures';
import { StructureContainer } from 'xxscreeps/mods/resource/container';
import { StructureController } from './objects/structures/controller';
import { StructureExtension } from '../../mods/spawn/extension';
import { StructureRoad } from './objects/structures/road';
import { StructureSpawn } from 'xxscreeps/mods/spawn/spawn';
import { StructureStorage } from './objects/structures/storage';
import { StructureTower } from './objects/structures/tower';

export function setupGlobals(globalThis: any) {

	// Global lodash compatibility
	globalThis._ = lodash;

	// Export constants
	for (const [ identifier, value ] of Object.entries(C)) {
		globalThis[identifier] = value;
	}

	// Namespaces
	globalThis.PathFinder = PathFinder;

	// Memory
	globalThis.RawMemory = Memory.RawMemory;
	Object.defineProperty(globalThis, 'Memory', {
		enumerable: true,
		get: Memory.get,
		set: Memory.set,
	});

	// Not implemented
	globalThis.Mineral = function() {};
	globalThis.StructureLink = function() {};
	globalThis.StructureObserver = function() {};
	globalThis.StructureTerminal = function() {};
	globalThis.Tombstone = function() {};

	// Export prototypes
	for (const [ key, object ] of Object.entries({
		ConstructionSite,
		Creep,
		Flag,
		Resource,
		Room,
		RoomObject,
		RoomPosition,
		RoomVisual,
		Structure,
		StructureContainer,
		StructureController,
		StructureExtension,
		StructureRoad,
		StructureSpawn,
		StructureStorage,
		StructureTower,
	})) {
		globalThis[key] = object;
	}
}
