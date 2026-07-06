import { structureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const roadShape = declare('Road', struct(structureShape, {
	...variant('road'),
	hits: 'int32',
	'#nextDecayTime': 'int32',
	'#terrain': 'int8',
}));
