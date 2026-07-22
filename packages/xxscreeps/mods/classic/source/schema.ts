import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const sourceShape = declare('Source', struct(roomObjectShape, {
	...variant('source'),

	/**
	 * The remaining amount of energy.
	 * @public
	 * @see https://docs.screeps.com/api/#Source.energy
	 */
	energy: 'int32',

	/**
	 * The total amount of energy in the source.
	 * @public
	 * @see https://docs.screeps.com/api/#Source.energyCapacity
	 */
	energyCapacity: 'int32',
	'#nextRegenerationTime': 'int32',
}));

/** @internal */
export const keeperLairShape = declare('KeeperLair', struct(ownedStructureShape, {
	...variant('keeperLair'),
	'#nextSpawnTime': 'int32',
}));

// Register schema extensions
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#cumulativeEnergyHarvested': 'int32',
});

// ---

declare module 'xxscreeps:mods/game' {
	interface RoomSchema { sourceSchema: [ typeof roomSchema ] }
}
