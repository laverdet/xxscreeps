import lodash from 'lodash';
import * as C from '~/game/constants';
import { RawMemory } from '~/game/memory';
import PathFinder from '~/game/path-finder';
import { ConstructionSite } from '~/game/objects/construction-site';
import { Creep } from '~/game/objects/creep';
import { RoomPosition } from '~/game/position';
import { Room } from '~/game/room';
import { RoomObject } from '~/game/objects/room-object';
import { Source } from '~/game/objects/source';
import { Structure } from '~/game/objects/structures';
import { StructureController } from '~/game/objects/structures/controller';
import { StructureExtension } from '~/game/objects/structures/extension';
import { StructureSpawn } from '~/game/objects/structures/spawn';
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
	globalThis.StructureContainer = function() {};
	globalThis.StructureLink = function() {};
	globalThis.StructureStorage = function() {};
	globalThis.StructureTerminal = function() {};
	globalThis.StructureTower = function() {};
	globalThis.Tombstone = function() {};

	// Export prototypes
	const Mineral = function(){};
	for (const [ key, object ] of Object.entries({
		ConstructionSite,
		Creep,
		Mineral,
		Room,
		RoomObject,
		RoomPosition,
		RoomVisual,
		Source,
		Structure,
		StructureController,
		StructureExtension,
		StructureSpawn,
	})) {
		globalThis[key] = object;
	}
}
