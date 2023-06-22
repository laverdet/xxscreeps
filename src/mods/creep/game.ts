import C from 'xxscreeps/game/constants/index.js';
import { Creep, format as creepFormat } from './creep.js';
import { Tombstone, format as tombstoneFormat } from './tombstone.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';

// Add `creeps` to global `Game` object
declare module 'xxscreeps/game/game' {
	interface Game {
		creeps: Record<string, Creep>;
	}
}
hooks.register('gameInitializer', Game => Game.creeps = Object.create(null));

// Export `Creep` & `Tombstone` to runtime globals
registerGlobal(Creep);
registerGlobal(Tombstone);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		Creep: typeof Creep;
		Tombstone: typeof Tombstone;
	}
}

// Register FIND_ types for `Creep` & `Tombstone`
const find = registerFindHandlers({
	[C.FIND_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS),
	[C.FIND_MY_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS).filter(creep => creep.my),
	[C.FIND_HOSTILE_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS).filter(creep => !creep.my && !creep.spawning),
	[C.FIND_TOMBSTONES]: room => room['#lookFor'](C.LOOK_TOMBSTONES),
});

// Register LOOK_ type for `Creep` & `Tombstone`
const look = [
	registerLook<Creep>()(C.LOOK_CREEPS),
	registerLook<Tombstone>()(C.LOOK_TOMBSTONES),
];
declare module 'xxscreeps/game/room' {
	interface Find { creep: typeof find }
	interface Look { creep: typeof look }
}

// Schema types
const creepSchema = registerVariant('Room.objects', creepFormat);
const tombstoneSchema = registerVariant('Room.objects', tombstoneFormat);
declare module 'xxscreeps/game/room' {
	interface Schema { creep: [ typeof creepSchema, typeof tombstoneSchema ] }
}
