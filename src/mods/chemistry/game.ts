import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as Lab from './lab.js';

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

declare module 'xxscreeps/mods/resource/index.js' {
	interface Schema { chemistry: typeof resourceSchema }
}

// Register `RoomObject` schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const labSchema = registerVariant('Room.objects', Lab.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { chemistry: [ typeof labSchema ] }
}

// Action log types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'reaction1', 'reaction2', 'reverseReaction1', 'reverseReaction2');
declare module 'xxscreeps/game/object.js' {
	interface Schema { chemistry: typeof actionSchema }
}
