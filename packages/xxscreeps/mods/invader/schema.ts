import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { spawningFormat } from 'xxscreeps/mods/spawn/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, optional, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const invaderCoreShape = declare('InvaderCore', struct(ownedStructureShape, {
	...variant('invaderCore'),
	hits: 'int32',
	level: 'int8',
	spawning: optional(spawningFormat, null),
	'#actionLog': actionLogFormat,
	'#deployTime': 'int32',
}));

// Track energy mined on room
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#invaderEnergyTarget': 'int32',
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const structureSchema = registerStruct('Structure', {
	'#collapseTime': 'int32',
});

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { invaderSchema: [ typeof roomSchema] }
}

declare module 'xxscreeps/mods/structure/schema.js' {
	interface StructureSchema { invaderSchema: [ typeof structureSchema ] }
}
