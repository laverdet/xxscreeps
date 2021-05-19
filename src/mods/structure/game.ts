import type { AnyStructure } from './structure';
import * as C from 'xxscreeps/game/constants';
import { registerGlobal } from 'xxscreeps/game';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room';
import { OwnedStructure, Structure } from './structure';

// Export `Structure` to runtime globals
registerGlobal(OwnedStructure);
registerGlobal(Structure);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		OwnedStructure: typeof OwnedStructure;
		Structure: typeof Structure;
	}
}

// Register FIND_ types for `Structure`
const find = registerFindHandlers({
	[C.FIND_STRUCTURES]: room => room['#lookFor'](C.LOOK_STRUCTURES),
	[C.FIND_MY_STRUCTURES]: room =>
		room['#lookFor'](C.LOOK_STRUCTURES).filter(structure => structure.my) as OwnedStructure[],
	[C.FIND_HOSTILE_STRUCTURES]: room =>
		room['#lookFor'](C.LOOK_STRUCTURES).filter(structure => structure.my === false) as OwnedStructure[],
});

// Register LOOK_ type for `Structure`
const look = registerLook<AnyStructure>()(C.LOOK_STRUCTURES);
declare module 'xxscreeps/game/room' {
	interface Find { structure: typeof find }
	interface Look { structure: typeof look }
}
