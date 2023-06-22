import * as Road from './road.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { registerVariant } from 'xxscreeps/engine/schema/index.js';

// Register schema
const schema = registerVariant('Room.objects', Road.format);
declare module 'xxscreeps/game/room' {
	interface Schema { road: typeof schema }
}

// Export `StructureRoad` to runtime globals
registerGlobal(Road.StructureRoad);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureRoad: typeof Road.StructureRoad }
}
