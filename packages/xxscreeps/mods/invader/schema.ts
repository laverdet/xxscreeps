import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { spawningFormat } from 'xxscreeps/mods/classic/spawn/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, enumerated, optional, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const invaderCoreShape = declare('InvaderCore', struct(ownedStructureShape, {
	...variant('invaderCore'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureInvaderCore.hits
	 */
	hits: 'int32',

	/**
	 * The level of the stronghold. The amount and quality of the loot depends on the level.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureInvaderCore.level
	 */
	level: 'int8',

	/**
	 * If the core is in process of spawning a new creep, this object will contain a
	 * [`StructureSpawn.Spawning`](https://docs.screeps.com/api/#StructureSpawn-Spawning) object, or
	 * null otherwise.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureInvaderCore.spawning
	 */
	spawning: optional(spawningFormat, null),
	'#actionLog': actionLogFormat,
	'#deployTime': 'int32',
	// Bunker layout this core deploys, e.g. 'bunker3'; its `rewardLevel` drives rampart hits and
	// container loot. Set at placement.
	'#templateName': enumerated(undefined, 'bunker1', 'bunker2', 'bunker3', 'bunker4', 'bunker5'),
}));

// Track energy mined on room
export type InvaderSchemaRoomSchema = typeof roomSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#invaderEnergyTarget': 'int32',
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const structureSchema = registerStruct('Structure', {
	'#collapseTime': 'int32',
	// Groups a deployed stronghold's structures — the invader core and every peer it spawns share
	// one id.
	'#strongholdId': Id.optionalFormat,
});

// ---

declare module 'xxscreeps/mods/classic/structure/schema.js' {
	interface StructureSchema { invaderSchema: [ typeof structureSchema ] }
}
