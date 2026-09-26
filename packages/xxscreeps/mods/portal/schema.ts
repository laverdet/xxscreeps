import { structureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const portalShape = declare('Portal', struct(structureShape, {
	...variant('portal'),
	'#destShard': 'string',
	'#destRoom': 'string',
	'#destX': 'int8',
	'#destY': 'int8',
	'#decayTime': 'int32',
	// Wall-clock ms when a stable portal starts to decay, or 0 for one that never will
	'#unstableTime': 'double',
}));
