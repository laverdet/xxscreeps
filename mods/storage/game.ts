import * as Storage from './storage';
import { registerGlobal } from 'xxscreeps/game';
import { registerSchema } from 'xxscreeps/engine/schema';

// Register schema
const schema = registerSchema('Room.objects', Storage.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		storage: typeof schema;
	}
}

// Export `StructureStorage` to runtime globals
registerGlobal(Storage.StructureStorage);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureStorage: Storage.StructureStorage }
}
