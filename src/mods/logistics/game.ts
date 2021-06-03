import * as Link from './link';
import * as Storage from './storage';
import { registerGlobal } from 'xxscreeps/game';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema';

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
