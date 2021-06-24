import type { AnyStructure } from './structure';
import * as C from 'xxscreeps/game/constants';
import { registerGlobal } from 'xxscreeps/game';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room';
import { registerVariant } from 'xxscreeps/engine/schema';
import { Ruin, format as ruinFormat } from './ruin';
import { OwnedStructure, Structure } from './structure';

// Export `Structure` & `Ruin` to runtime globals
registerGlobal(OwnedStructure);
registerGlobal(Ruin);
registerGlobal(Structure);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		OwnedStructure: typeof OwnedStructure;
		Ruin: typeof Ruin;
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
	[C.FIND_RUINS]: room => room['#lookFor'](C.LOOK_RUINS),
});

// Register LOOK_ type for `Structure`
const look = [
	registerLook<Ruin>()(C.LOOK_RUINS),
	registerLook<AnyStructure>()(C.LOOK_STRUCTURES),
];
declare module 'xxscreeps/game/room' {
	interface Find { structure: typeof find }
	interface Look { structure: typeof look }
}

// Register schema type for `Ruin`
const schema = registerVariant('Room.objects', ruinFormat);
declare module 'xxscreeps/game/room' {
	interface Schema { structure: [ typeof schema ] }
}
