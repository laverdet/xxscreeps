import { structureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const roadShape = declare('Road', struct(structureShape, {
	...variant('road'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureRoad.hits
	 */
	hits: 'int32',
	'#nextDecayTime': 'int32',
	'#terrain': 'int8',
}));
