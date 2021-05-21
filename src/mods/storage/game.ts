import * as Storage from './storage';
import { registerGlobal } from 'xxscreeps/game';
import { registerVariant } from 'xxscreeps/engine/schema';

// Register schema
const schema = registerVariant('Room.objects', Storage.format);
declare module 'xxscreeps/game/room' {
	interface Schema { storage: typeof schema }
}

// Export `StructureStorage` to runtime globals
registerGlobal(Storage.StructureStorage);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureStorage: typeof Storage.StructureStorage }
}
