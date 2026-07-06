import { structureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';
import { openStoreFormat } from './schema.js';

// nb: Defined separately to avoid the Ruin -> Resource -> Container cycle

/** @internal */
export const containerShape = declare('Container', struct(structureShape, {
	...variant('container'),
	hits: 'int32',
	store: openStoreFormat,
	'#nextDecayTime': 'int32',
}));
