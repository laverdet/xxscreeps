import * as C from 'xxscreeps/game/constants';
import * as Extension from './extension';
import * as Spawn from './spawn';
import { hooks, registerGlobal } from 'xxscreeps/game';
import { registerFindHandlers } from 'xxscreeps/game/room';
import { registerVariant } from 'xxscreeps/engine/schema';

// Add `spawns` to global `Game` object
declare module 'xxscreeps/game/game' {
	interface Game {
		spawns: Record<string, Spawn.StructureSpawn>;
	}
}
hooks.register('gameInitializer', Game => Game.spawns = Object.create(null));

// Accumulate `energyAvailable` and `energyCapacityAvailable` on `Room` objects
declare module 'xxscreeps/game/room' {
	interface Room {
		energyAvailable: number;
		energyCapacityAvailable: number;
	}
}

hooks.register('roomInitializer', room => {
	room.energyAvailable = 0;
	room.energyCapacityAvailable = 0;
	for (const object of room.find(C.FIND_STRUCTURES)) {
		if (object.structureType === C.STRUCTURE_SPAWN || object.structureType === C.STRUCTURE_EXTENSION) {
			room.energyAvailable += object.store[C.RESOURCE_ENERGY];
			room.energyCapacityAvailable += object.store.getCapacity(C.RESOURCE_ENERGY);
		}
	}
});

// Export `StructureExtension` & `StructureSpawn` to runtime globals
registerGlobal(Extension.StructureExtension);
registerGlobal(Spawn.StructureSpawn);
registerGlobal('Spawn', Spawn.StructureSpawn);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		StructureExtension: typeof Extension.StructureExtension;
		StructureSpawn: typeof Spawn.StructureSpawn;
		Spawn: typeof Spawn.StructureSpawn;
	}
}

// Register FIND_ types for `Spawn`
const find = registerFindHandlers({
	[C.FIND_MY_SPAWNS]: room => room['#lookFor'](C.LOOK_STRUCTURES).filter(
		(structure): structure is Spawn.StructureSpawn => structure.structureType === 'spawn' && structure.my!),
	[C.FIND_HOSTILE_SPAWNS]: room => room['#lookFor'](C.LOOK_STRUCTURES).filter(
		(structure): structure is Spawn.StructureSpawn => structure.structureType === 'spawn' && structure.my === false),
});
declare module 'xxscreeps/game/room' {
	interface Find { spawn: typeof find }
}

// Register schema
const extensionSchema = registerVariant('Room.objects', Extension.format);
const spawnSchema = registerVariant('Room.objects', Spawn.format);
declare module 'xxscreeps/game/room' {
	interface Schema { spawn: [ typeof extensionSchema, typeof spawnSchema ] }
}
