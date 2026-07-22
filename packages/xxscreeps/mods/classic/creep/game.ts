import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { Creep } from './creep.js';
import { creepShape, tombstoneShape } from './schema.js';
import { Tombstone } from './tombstone.js';

// Add `creeps` to global `Game` object
hooks.register('gameInitializer', Game => Game.creeps = Object.create(null));

// Export `Creep` & `Tombstone` to runtime globals
registerGlobal(Creep);
registerGlobal(Tombstone);

// Register FIND_ types for `Creep` & `Tombstone`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS),
	[C.FIND_MY_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS).filter(creep => creep.my),
	[C.FIND_HOSTILE_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS).filter(creep => !creep.my && !creep.spawning),
	[C.FIND_TOMBSTONES]: room => room['#lookFor'](C.LOOK_TOMBSTONES),
});

// Register LOOK_ type for `Creep` & `Tombstone`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = [
	registerLook<Creep>()(C.LOOK_CREEPS),
	registerLook<Tombstone>()(C.LOOK_TOMBSTONES),
];

// Schema types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const creepSchema = registerVariant('Room.objects', compose(creepShape, Creep));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const tombstoneSchema = registerVariant('Room.objects', compose(tombstoneShape, Tombstone));

// ---

declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * A hash containing all your creeps with creep names as hash keys.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.creeps
		 */
		creeps: Record<string, Creep>;
	}
}

declare module 'xxscreeps/game/room/index.js' {
	interface Find { creep: typeof find }
	interface Look { creep: typeof look }
	interface RoomSchema {
		creep: [
			typeof creepSchema,
			typeof tombstoneSchema,
		];
	}
}

declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		Creep: typeof Creep;
		Tombstone: typeof Tombstone;
	}
}
