import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructureInvaderCore } from './invader-core.js';
import { invaderCoreShape } from './schema.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const invaderCoreSchema = registerVariant('Room.objects', compose(invaderCoreShape, StructureInvaderCore));

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { invader: [ typeof invaderCoreSchema ] }
}
