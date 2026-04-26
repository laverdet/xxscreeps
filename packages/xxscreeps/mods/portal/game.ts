import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as Portal from './portal.js';

const schema = registerVariant('Room.objects', Portal.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { portal: typeof schema }
}

registerGlobal(Portal.StructurePortal);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructurePortal: typeof Portal.StructurePortal }
}
