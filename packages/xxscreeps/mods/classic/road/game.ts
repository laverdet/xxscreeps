import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructureRoad } from './road.js';
import { roadShape } from './schema.js';

// Export `StructureRoad` to runtime globals
registerGlobal(StructureRoad);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const schema = registerVariant('Room.objects', compose(roadShape, StructureRoad));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureRoad: typeof StructureRoad }
}

declare module 'xxscreeps:mods/game' {
	interface RoomSchema { road: typeof schema }
}
