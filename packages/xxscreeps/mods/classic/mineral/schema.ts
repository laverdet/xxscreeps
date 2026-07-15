import { registerEnumerated } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const extractorShape = declare('Extractor', struct(ownedStructureShape, {
	...variant('extractor'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureExtractor.hits
	 */
	hits: 'int32',
	'#cooldownTime': 'int32',
}));

/** @internal */
export const mineralShape = declare('Mineral', struct(roomObjectShape, {
	...variant('mineral'),

	/**
	 * The density that this mineral deposit will be refilled to once `ticksToRegeneration` reaches 0.
	 * This is one of the `DENSITY_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#Mineral.density
	 */
	density: 'int32',

	/**
	 * The remaining amount of resources.
	 * @public
	 * @see https://docs.screeps.com/api/#Mineral.mineralAmount
	 */
	mineralAmount: 'int32',

	/**
	 * The resource type, one of the `RESOURCE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#Mineral.mineralType
	 */
	mineralType: resourceEnumFormat,
	'#nextRegenerationTime': 'int32',
}));

// Register schema extensions
const resources = [
	C.RESOURCE_HYDROGEN, C.RESOURCE_OXYGEN,
	C.RESOURCE_UTRIUM, C.RESOURCE_LEMERGIUM, C.RESOURCE_KEANIUM,
	C.RESOURCE_ZYNTHIUM, C.RESOURCE_CATALYST, C.RESOURCE_GHODIUM,
];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const resourceSchema = registerEnumerated('ResourceType', ...resources);
C.RESOURCES_ALL.push(...resources);

// ---

declare module 'xxscreeps/mods/classic/resource/schema.js' {
	interface ResourceSchema { mineral: typeof resourceSchema }
}
