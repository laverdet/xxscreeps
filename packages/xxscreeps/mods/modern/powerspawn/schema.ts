import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';
import { powerSpawnStoreFormat } from './store.js';

/** @internal */
export const powerSpawnShape = declare('PowerSpawn', struct(ownedStructureShape, {
	...variant('powerSpawn'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructurePowerSpawn.store
	 */
	store: powerSpawnStoreFormat,
}));
