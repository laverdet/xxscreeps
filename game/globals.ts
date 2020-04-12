import lodash from 'lodash';
import * as C from './constants';
import { RawMemory } from './memory';
import PathFinder from './path-finder';
import { Flag } from './flag';
import { RoomPosition } from './position';
import { Room } from './room';
import { RoomVisual } from './visual';

import { ConstructionSite } from './objects/construction-site';
import { Creep } from './objects/creep';
import { Resource } from './objects/resource';
import { RoomObject } from './objects/room-object';
import { Source } from './objects/source';
import { Structure } from './objects/structures';
import { StructureContainer } from './objects/structures/container';
import { StructureController } from './objects/structures/controller';
import { StructureExtension } from './objects/structures/extension';
import { StructureRoad } from './objects/structures/road';
import { StructureSpawn } from './objects/structures/spawn';
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
	globalThis.RawMemory = RawMemory;

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
		Source,
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
