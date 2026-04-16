import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as Link from './link.js';
import * as Storage from './storage.js';

// Register schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const linkSchema = registerVariant('Room.objects', Link.format);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const storageSchema = registerVariant('Room.objects', Storage.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { logistics: [ typeof linkSchema, typeof storageSchema ] }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'transferEnergy');
declare module 'xxscreeps/game/object.js' {
	interface Schema { logistics: typeof actionSchema }
}

// Export `StructureLink` and `StructureStorage` to runtime globals
registerGlobal(Link.StructureLink);
registerGlobal(Storage.StructureStorage);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		StructureLink: typeof Link.StructureLink;
		StructureStorage: typeof Storage.StructureStorage;
	}
}
