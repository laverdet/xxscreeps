import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructurePortal } from './portal.js';
import { portalShape } from './schema.js';

registerGlobal(StructurePortal);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const schema = registerVariant('Room.objects', compose(portalShape, StructurePortal));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructurePortal: typeof StructurePortal }
}

declare module 'xxscreeps:mods/game' {
	interface RoomSchema { portal: typeof schema }
}
