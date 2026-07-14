import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { Nuke } from './nuke.js';
import { StructureNuker } from './nuker.js';
import { nukeShape, nukerShape } from './schema.js';

registerGlobal(StructureNuker);
registerGlobal(Nuke);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_NUKES]: room => room['#lookFor'](C.LOOK_NUKES),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Nuke>()(C.LOOK_NUKES);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nukerSchema = registerVariant('Room.objects', compose(nukerShape, StructureNuker));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nukeSchema = registerVariant('Room.objects', compose(nukeShape, Nuke));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		Nuke: typeof Nuke;
		StructureNuker: typeof StructureNuker;
	}
}

declare module 'xxscreeps/game/room/index.js' {
	interface Find { nuker: typeof find }
	interface Look { nuker: typeof look }
	interface RoomSchema { nuker: [ typeof nukerSchema, typeof nukeSchema ] }
}
