import * as C from 'xxscreeps/game/constants';
import * as Extension from './extension';
import * as Spawn from './spawn';
import { registerGameInitializer, registerGlobal } from 'xxscreeps/game';
import { lookFor, registerFindHandlers } from 'xxscreeps/game/room';
import { registerSchema } from 'xxscreeps/engine/schema';

// Add `spawns` to global `game` object
declare module 'xxscreeps/game' {
	interface Game {
		spawns: Record<string, Spawn.StructureSpawn>;
	}
}
registerGameInitializer(game => game.spawns = Object.create(null));

// Export `StructureExtension` & `StructureSpawn` to runtime globals
registerGlobal(Extension.StructureExtension);
registerGlobal(Spawn.StructureSpawn);

// Register FIND_ types for `Spawn`
const find = registerFindHandlers({
	[C.FIND_MY_SPAWNS]: room => lookFor(room, C.LOOK_STRUCTURES).filter(
		structure => structure.structureType === 'spawn' && structure.my),
	[C.FIND_HOSTILE_SPAWNS]: room => lookFor(room, C.LOOK_STRUCTURES).filter(
		structure => structure.structureType === 'spawn' && structure.my === false),
});
declare module 'xxscreeps/game/room' {
	interface Find { spawn: typeof find }
}

// Register schema
const schema = registerSchema('Room.objects', Extension.format);
const schema2 = registerSchema('Room.objects', Spawn.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		spawn: [ typeof schema, typeof schema2 ];
	}
}