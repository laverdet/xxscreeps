import lodash from 'lodash';
import * as C from '~/game/constants';
import { RawMemory } from '~/game/memory';
import PathFinder from '~/game/path-finder';
import { RoomPosition } from '~/game/position';
import { Room } from '~/game/room';

import { ConstructionSite } from '~/game/objects/construction-site';
import { Creep } from '~/game/objects/creep';
import { Resource } from '~/game/objects/resource';
import { RoomObject } from '~/game/objects/room-object';
import { Source } from '~/game/objects/source';
import { Structure } from '~/game/objects/structures';
import { StructureContainer } from '~/game/objects/structures/container';
import { StructureController } from '~/game/objects/structures/controller';
import { StructureExtension } from '~/game/objects/structures/extension';
import { StructureRoad } from '~/game/objects/structures/road';
import { StructureSpawn } from '~/game/objects/structures/spawn';
import { StructureStorage } from '~/game/objects/structures/storage';
import { StructureTower } from '~/game/objects/structures/tower';
import { RoomVisual } from '~/game/visual';

declare const globalThis: any;
export function setupGlobals() {

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
	globalThis.StructureTerminal = function() {};
	globalThis.Tombstone = function() {};

	// Export prototypes
	for (const [ key, object ] of Object.entries({
		ConstructionSite,
		Creep,
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
