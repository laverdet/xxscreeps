import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { spawningFormat } from 'xxscreeps/mods/spawn/schema.js';
import { Spawning } from 'xxscreeps/mods/spawn/spawn.js';
import { ownedStructureShape } from 'xxscreeps/mods/structure/schema.js';
import { compose, declare, optional, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const invaderCoreShape = declare('InvaderCore', struct(ownedStructureShape, {
	...variant('invaderCore'),
	hits: 'int32',
	level: 'int8',
	spawning: optional(compose(spawningFormat, Spawning), null),
	'#actionLog': actionLogFormat,
	'#collapseTime': 'int32',
	'#deployTime': 'int32',
}));

// Track energy mined on room
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#invaderEnergyTarget': 'int32',
});

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { invaderSchema: [ typeof roomSchema] }
}
