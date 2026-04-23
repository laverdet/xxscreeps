import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as Road from './road.js';

// Register schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const schema = registerVariant('Room.objects', Road.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { road: typeof schema }
}

// Export `StructureRoad` to runtime globals
registerGlobal(Road.StructureRoad);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureRoad: typeof Road.StructureRoad }
}
