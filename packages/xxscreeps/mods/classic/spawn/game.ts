import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers } from 'xxscreeps/game/room/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureExtension } from './extension.js';
import { extensionShape, spawnShape } from './schema.js';
import { StructureSpawn } from './spawn.js';

// Add `spawns` to global `Game` object
declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * A hash containing all your spawns with spawn names as hash keys.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.spawns
		 */
		spawns: Record<string, StructureSpawn>;
	}
}
hooks.register('gameInitializer', Game => Game.spawns = Object.create(null));

hooks.register('roomInitializer', room => {
	room.energyAvailable = 0;
	room.energyCapacityAvailable = 0;
	for (const object of room.find(C.FIND_STRUCTURES)) {
		if (
			(object.structureType === C.STRUCTURE_SPAWN || object.structureType === C.STRUCTURE_EXTENSION) &&
			object.isActive()
		) {
			room.energyAvailable += object.store[C.RESOURCE_ENERGY];
			room.energyCapacityAvailable += object.store.getCapacity(C.RESOURCE_ENERGY);
		}
	}
});

// Export `StructureExtension` & `StructureSpawn` to runtime globals
registerGlobal(StructureExtension);
registerGlobal(StructureSpawn);
registerGlobal('Spawn', StructureSpawn);

// Register FIND_ types for `Spawn`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_MY_SPAWNS]: room => room['#lookFor'](C.LOOK_STRUCTURES).filter(
		(structure): structure is StructureSpawn => structure.structureType === 'spawn' && structure.my === true),
	[C.FIND_HOSTILE_SPAWNS]: room => room['#lookFor'](C.LOOK_STRUCTURES).filter(
		(structure): structure is StructureSpawn => structure.structureType === 'spawn' && !structure.my),
});

// Register schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const extensionSchema = registerVariant('Room.objects', compose(extensionShape, StructureExtension));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const spawnSchema = registerVariant('Room.objects', compose(spawnShape, StructureSpawn));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		StructureExtension: typeof StructureExtension;
		StructureSpawn: typeof StructureSpawn;
		Spawn: typeof StructureSpawn;
	}
}

declare module 'xxscreeps/game/room/index.js' {
	interface Find { spawn: typeof find }
	interface Room {
		/**
		 * Total amount of energy available in all spawns and extensions in the room.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.energyAvailable
		 */
		energyAvailable: number;

		/**
		 * Total amount of `energyCapacity` of all spawns and extensions in the room.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.energyCapacityAvailable
		 */
		energyCapacityAvailable: number;
	}
	interface RoomSchema { spawn: [ typeof extensionSchema, typeof spawnSchema ] }
}
