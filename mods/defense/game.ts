import * as Tower from './tower';
import { registerGlobal } from 'xxscreeps/game';
import { registerSchema } from 'xxscreeps/engine/schema';

// Register schema
const schema = registerSchema('Room.objects', Tower.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		defense: typeof schema;
	}
}

// Export `StructureTower` to runtime globals
registerGlobal(Tower.StructureTower);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureTower: typeof Tower.StructureTower }
}
