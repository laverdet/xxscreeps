import * as Id from 'xxscreeps/engine/schema/id.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const observerShape = declare('Observer', struct(ownedStructureShape, {
	...variant('observer'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureObserver.hits
	 */
	hits: 'int32',
}));

/** @internal */
export const observerSpyShape = declare('ObserverSpy', struct(roomObjectShape, {
	...variant('ObserverSpy'),
	'#user': Id.format,
}));
