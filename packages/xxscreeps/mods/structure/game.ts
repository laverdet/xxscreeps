import type { AnyStructure } from './structure.js';
import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { Ruin, format as ruinFormat } from './ruin.js';
import { OwnedStructure, Structure } from './structure.js';

// Export `Structure` & `Ruin` to runtime globals
registerGlobal(OwnedStructure);
registerGlobal(Ruin);
registerGlobal(Structure);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		OwnedStructure: typeof OwnedStructure;
		Ruin: typeof Ruin;
		Structure: typeof Structure;
	}
}

// Register FIND_ types for `Structure`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_STRUCTURES]: room => room['#lookFor'](C.LOOK_STRUCTURES),
	[C.FIND_MY_STRUCTURES]: room =>
		room['#lookFor'](C.LOOK_STRUCTURES).filter(structure => structure.my) as OwnedStructure[],
	[C.FIND_HOSTILE_STRUCTURES]: room =>
		room['#lookFor'](C.LOOK_STRUCTURES).filter(structure => structure.my === false) as OwnedStructure[],
	[C.FIND_RUINS]: room => room['#lookFor'](C.LOOK_RUINS),
});

// Register LOOK_ type for `Structure`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = [
	registerLook<Ruin>()(C.LOOK_RUINS),
	registerLook<AnyStructure>()(C.LOOK_STRUCTURES),
];
declare module 'xxscreeps/game/room/index.js' {
	interface Find { structure: typeof find }
	interface Look { structure: typeof look }
}

// Register schema type for `Ruin`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const schema = registerVariant('Room.objects', ruinFormat);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { structure: [ typeof schema ] }
}
