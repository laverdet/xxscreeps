import * as Road from './road';
import { registerGlobal } from 'xxscreeps/game';
import { registerSchema } from 'xxscreeps/engine/schema';

// Register schema
const schema = registerSchema('Room.objects', Road.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		road: typeof schema;
	}
}

// Export `StructureRoad` to runtime globals
registerGlobal(Road.StructureRoad);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureRoad: typeof Road.StructureRoad }
}
