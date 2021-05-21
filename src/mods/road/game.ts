import * as Road from './road';
import { registerGlobal } from 'xxscreeps/game';
import { registerVariant } from 'xxscreeps/engine/schema';

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
