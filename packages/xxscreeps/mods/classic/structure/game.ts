import type { AnyStructure } from './structure.js';
import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { Ruin } from './ruin.js';
import { ruinShape } from './schema.js';
import { OwnedStructure, Structure } from './structure.js';

// Export `Structure` & `Ruin` to runtime globals
registerGlobal(OwnedStructure);
registerGlobal(Ruin);
registerGlobal(Structure);

// Register FIND_ types for `Structure`
export type StructureFind = typeof find;
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
export type StructureLook = typeof look;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = [
	registerLook<Ruin>()(C.LOOK_RUINS),
	registerLook<AnyStructure>()(C.LOOK_STRUCTURES),
];

// Register schema type for `Ruin`
export type StructureRoomSchema = typeof ruinSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ruinSchema = registerVariant('Room.objects', compose(ruinShape, Ruin));

// Register `Game.structures`
hooks.register('gameInitializer', Game => Game.structures = Object.create(null) as Record<string, AnyStructure>);

// ---

declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * A hash containing all your structures with structure id as hash keys.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.structures
		 */
		structures: Record<string, AnyStructure>;
	}
}

declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		OwnedStructure: typeof OwnedStructure;
		Ruin: typeof Ruin;
		Structure: typeof Structure;
	}
}
