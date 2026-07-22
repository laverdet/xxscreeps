import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructureLink } from './link.js';
import { linkShape, storageShape } from './schema.js';
import { StructureStorage } from './storage.js';

// Export `StructureLink` and `StructureStorage` to runtime globals
registerGlobal(StructureLink);
registerGlobal(StructureStorage);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const linkSchema = registerVariant('Room.objects', compose(linkShape, StructureLink));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const storageSchema = registerVariant('Room.objects', compose(storageShape, StructureStorage));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		StructureLink: typeof StructureLink;
		StructureStorage: typeof StructureStorage;
	}
}

declare module 'xxscreeps:mods/game' {
	interface RoomSchema { logistics: [ typeof linkSchema, typeof storageSchema ] }
}
