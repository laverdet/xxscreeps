import * as Link from './link.js';
import * as Storage from './storage.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';

// Register schema
const linkSchema = registerVariant('Room.objects', Link.format);
const storageSchema = registerVariant('Room.objects', Storage.format);
declare module 'xxscreeps/game/room' {
	interface Schema { logistics: [ typeof linkSchema, typeof storageSchema ] }
}

const actionSchema = registerEnumerated('ActionLog.action', 'transferEnergy');
declare module 'xxscreeps/game/object' {
	interface Schema { logistics: typeof actionSchema }
}

// Export `StructureLink` and `StructureStorage` to runtime globals
registerGlobal(Link.StructureLink);
registerGlobal(Storage.StructureStorage);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		StructureLink: typeof Link.StructureLink;
		StructureStorage: typeof Storage.StructureStorage;
	}
}
