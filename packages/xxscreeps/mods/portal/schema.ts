import { structureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const portalShape = declare('Portal', struct(structureShape, {
	...variant('portal'),
	'#destShard': 'string',
	'#destRoom': 'string',
	'#destX': 'int8',
	'#destY': 'int8',
	'#decayTime': 'int32',
}));
