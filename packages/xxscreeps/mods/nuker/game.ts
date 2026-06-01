import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import * as Nuke from './nuke.js';
import * as Nuker from './nuker.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nukerSchema = registerVariant('Room.objects', Nuker.format);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nukeSchema = registerVariant('Room.objects', Nuke.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { nuker: [ typeof nukerSchema, typeof nukeSchema ] }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_NUKES]: room => room['#lookFor'](C.LOOK_NUKES),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Nuke.Nuke>()(C.LOOK_NUKES);
declare module 'xxscreeps/game/room/index.js' {
	interface Find { nuker: typeof find }
	interface Look { nuker: typeof look }
}

registerGlobal(Nuker.StructureNuker);
registerGlobal(Nuke.Nuke);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		Nuke: typeof Nuke.Nuke;
		StructureNuker: typeof Nuker.StructureNuker;
	}
}
