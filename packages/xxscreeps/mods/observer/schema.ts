import * as Id from 'xxscreeps/engine/schema/id.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const observerShape = declare('Observer', struct(ownedStructureShape, {
	...variant('observer'),
	hits: 'int32',
}));

/** @internal */
export const observerSpyShape = declare('ObserverSpy', struct(roomObjectShape, {
	...variant('ObserverSpy'),
	'#user': Id.format,
}));
