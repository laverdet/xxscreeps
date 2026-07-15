import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';
import { nukerStoreFormat } from './store.js';

/** @internal */
export const nukeShape = declare('Nuke', struct(roomObjectShape, {
	...variant('nuke'),
	'#landTime': 'int32',
	'#launchRoomName': 'string',
}));

/** @internal */
export const nukerShape = declare('Nuker', struct(ownedStructureShape, {
	...variant('nuker'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureNuker.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureNuker.store
	 */
	store: nukerStoreFormat,
	'#cooldownTime': 'int32',
}));
