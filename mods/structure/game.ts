import * as C from 'xxscreeps/game/constants';
import * as Structure from './structure';
import { registerGlobal } from 'xxscreeps/game';
import { lookFor, registerFindHandlers, registerLook } from 'xxscreeps/game/room';

// Export `Structure` to runtime globals
registerGlobal(Structure.Structure);

// Register FIND_ types for `Structure`
const find = registerFindHandlers({
	[C.FIND_STRUCTURES]: room => lookFor(room, C.LOOK_STRUCTURES),
	[C.FIND_MY_STRUCTURES]: room =>
		lookFor(room, C.LOOK_STRUCTURES).filter(structure => structure.my),
	[C.FIND_HOSTILE_STRUCTURES]: room =>
		lookFor(room, C.LOOK_STRUCTURES).filter(structure => structure.my === false),
});

// Register LOOK_ type for `Structure`
const look = registerLook<Structure.AnyStructure>()(C.LOOK_STRUCTURES);
declare module 'xxscreeps/game/room' {
	interface Find { structure: typeof find }
	interface Look { structure: typeof look }
}
