import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructureFactory } from './factory.js';
import { factoryShape } from './schema.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const factorySchema = registerVariant('Room.objects', compose(factoryShape, StructureFactory));

// ---

declare module 'xxscreeps:mods/game' {
	interface RoomSchema { factory: [ typeof factorySchema ] }
}
