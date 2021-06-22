import * as C from 'xxscreeps/game/constants';
import * as Creep from './creep';
import { hooks, registerGlobal } from 'xxscreeps/game';
import { registerVariant } from 'xxscreeps/engine/schema';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room';

// Add `creeps` to global `Game` object
declare module 'xxscreeps/game/game' {
	interface Game {
		creeps: Record<string, Creep.Creep>;
	}
}
hooks.register('gameInitializer', Game => Game.creeps = Object.create(null));

// Export `Creep` to runtime globals
registerGlobal(Creep.Creep);
declare module 'xxscreeps/game/runtime' {
	interface Global { Creep: typeof Creep.Creep }
}

// Register FIND_ types for `Creep`
const find = registerFindHandlers({
	[C.FIND_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS),
	[C.FIND_MY_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS).filter(creep => creep.my),
	[C.FIND_HOSTILE_CREEPS]: room => room['#lookFor'](C.LOOK_CREEPS).filter(creep => !creep.my && !creep.spawning),
});

// Register LOOK_ type for `Creep`
const look = registerLook<Creep.Creep>()(C.LOOK_CREEPS);
declare module 'xxscreeps/game/room' {
	interface Find { creep: typeof find }
	interface Look { creep: typeof look }
}

// Schema types
const schema = registerVariant('Room.objects', Creep.format);
declare module 'xxscreeps/game/room' {
	interface Schema { creep: typeof schema }
}
