import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { makeSingleStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape, structureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const towerShape = declare('Tower', struct(ownedStructureShape, {
	...variant('tower'),
	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureTower.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureTower.store
	 */
	store: makeSingleStoreFormat(),
	'#actionLog': actionLogFormat,
}));

/** @internal */
export const rampartShape = declare('Rampart', struct(ownedStructureShape, {
	...variant('rampart'),
	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureRampart.hits
	 */
	hits: 'int32',

	/**
	 * If false (default), only your creeps can step on the same square. If true, any hostile creeps
	 * can pass through.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureRampart.isPublic
	 */
	isPublic: 'bool',
	'#nextDecayTime': 'int32',
}));

/** @internal */
export const wallShape = declare('Wall', struct(structureShape, {
	...variant('constructedWall'),
	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureWall.hits
	 */
	hits: 'int32',
}));
