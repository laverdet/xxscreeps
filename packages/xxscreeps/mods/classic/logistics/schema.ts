import { registerEnumerated } from 'xxscreeps/engine/schema/index.js';
import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { makeSingleStoreFormat, openStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const linkShape = declare('Link', struct(ownedStructureShape, {
	...variant('link'),
	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureLink.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureLink.store
	 */
	store: makeSingleStoreFormat(),
	'#actionLog': actionLogFormat,
	'#cooldownTime': 'int32',
}));

/** @internal */
export const storageShape = declare('Storage', struct(ownedStructureShape, {
	...variant('storage'),
	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureStorage.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureStorage.store
	 */
	store: openStoreFormat,
}));

registerEnumerated('ActionLog.action', 'transferEnergy');
