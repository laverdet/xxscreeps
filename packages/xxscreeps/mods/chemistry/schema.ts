import { registerEnumerated } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';
import { labStoreFormat } from './store.js';

/** @internal */
export const labShape = declare('Lab', struct(ownedStructureShape, {
	...variant('lab'),
	hits: 'int32',
	store: labStoreFormat,
	'#actionLog': actionLogFormat,
	'#cooldownTime': 'int32',
}));

// Register `ResourceType` schema
const resources = [
	C.RESOURCE_HYDROXIDE, C.RESOURCE_ZYNTHIUM_KEANITE, C.RESOURCE_UTRIUM_LEMERGITE,

	C.RESOURCE_UTRIUM_HYDRIDE, C.RESOURCE_UTRIUM_OXIDE, C.RESOURCE_KEANIUM_HYDRIDE, C.RESOURCE_KEANIUM_OXIDE,
	C.RESOURCE_LEMERGIUM_HYDRIDE, C.RESOURCE_LEMERGIUM_OXIDE, C.RESOURCE_ZYNTHIUM_HYDRIDE, C.RESOURCE_ZYNTHIUM_OXIDE,
	C.RESOURCE_GHODIUM_HYDRIDE, C.RESOURCE_GHODIUM_OXIDE,

	C.RESOURCE_UTRIUM_ACID, C.RESOURCE_UTRIUM_ALKALIDE, C.RESOURCE_KEANIUM_ACID, C.RESOURCE_KEANIUM_ALKALIDE,
	C.RESOURCE_LEMERGIUM_ACID, C.RESOURCE_LEMERGIUM_ALKALIDE, C.RESOURCE_ZYNTHIUM_ACID, C.RESOURCE_ZYNTHIUM_ALKALIDE,
	C.RESOURCE_GHODIUM_ACID, C.RESOURCE_GHODIUM_ALKALIDE,

	C.RESOURCE_CATALYZED_UTRIUM_ACID, C.RESOURCE_CATALYZED_UTRIUM_ALKALIDE, C.RESOURCE_CATALYZED_KEANIUM_ACID,
	C.RESOURCE_CATALYZED_KEANIUM_ALKALIDE, C.RESOURCE_CATALYZED_LEMERGIUM_ACID, C.RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
	C.RESOURCE_CATALYZED_ZYNTHIUM_ACID, C.RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, C.RESOURCE_CATALYZED_GHODIUM_ACID,
	C.RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const resourceSchema = registerEnumerated('ResourceType', ...resources);
C.RESOURCES_ALL.push(...resources);

// Action log types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'reaction1', 'reaction2', 'reverseReaction1', 'reverseReaction2');

// ---

declare module 'xxscreeps/mods/resource/schema.js' {
	interface ResourceSchema { chemistry: typeof resourceSchema }
}

declare module 'xxscreeps/game/schema.js' {
	interface ActionLogSchema { chemistry: typeof actionSchema }
}
