import * as C from 'xxscreeps/game/constants';
import * as Creep from './creep';
import { registerGameInitializer, registerGlobal } from 'xxscreeps/game';
import { registerSchema } from 'xxscreeps/engine/schema';
import { LookFor, registerFindHandlers, registerLook } from 'xxscreeps/game/room';

// Add `creeps` to global `Game` object
declare module 'xxscreeps/game/game' {
	interface Game {
		creeps: Record<string, Creep.Creep>;
	}
}
registerGameInitializer(Game => Game.creeps = Object.create(null));

// Export `Creep` to runtime globals
registerGlobal(Creep.Creep);
declare module 'xxscreeps/game/runtime' {
	interface Global { Creep: typeof Creep.Creep }
}

// Register FIND_ types for `Creep`
const find = registerFindHandlers({
	[C.FIND_CREEPS]: room => room[LookFor](C.LOOK_CREEPS),
	[C.FIND_MY_CREEPS]: room => room[LookFor](C.LOOK_CREEPS).filter(creep => creep.my),
	[C.FIND_HOSTILE_CREEPS]: room => room[LookFor](C.LOOK_CREEPS).filter(creep => !creep.my),
});

// Register LOOK_ type for `Creep`
const look = registerLook<Creep.Creep>()(C.LOOK_CREEPS);
declare module 'xxscreeps/game/room' {
	interface Find { creep: typeof find }
	interface Look { creep: typeof look }
}

// Schema types
declare module 'xxscreeps/engine/schema' {
	interface Schema { creep: typeof schema }
}
const schema = registerSchema('Room.objects', Creep.format);
