import { registerEnumerated } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const extractorShape = declare('Extractor', struct(ownedStructureShape, {
	...variant('extractor'),
	hits: 'int32',
	'#cooldownTime': 'int32',
}));

/** @internal */
export const mineralShape = declare('Mineral', struct(roomObjectShape, {
	...variant('mineral'),
	density: 'int32',
	mineralAmount: 'int32',
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

declare module 'xxscreeps/mods/resource/schema.js' {
	interface ResourceSchema { mineral: typeof resourceSchema }
}
