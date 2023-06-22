import C from 'xxscreeps/game/constants/index.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import * as Extractor from './extractor.js';
import * as Mineral from './mineral.js';

// Register schema extensions
const resources = [
	C.RESOURCE_HYDROGEN, C.RESOURCE_OXYGEN,
	C.RESOURCE_UTRIUM, C.RESOURCE_LEMERGIUM, C.RESOURCE_KEANIUM,
	C.RESOURCE_ZYNTHIUM, C.RESOURCE_CATALYST, C.RESOURCE_GHODIUM,
];
const resourceSchema = registerEnumerated('ResourceType', ...resources);
C.RESOURCES_ALL.push(...resources);
declare module 'xxscreeps/mods/resource' {
	interface Schema { mineral: typeof resourceSchema }
}

const extractorSchema = registerVariant('Room.objects', Extractor.format);
const mineralSchema = registerVariant('Room.objects', Mineral.format);
declare module 'xxscreeps/game/room' {
	interface Schema { mineral: [ typeof extractorSchema, typeof mineralSchema ] }
}

// Register FIND_ type for `Mineral`
const find = registerFindHandlers({
	[C.FIND_MINERALS]: room =>
		room['#lookFor'](C.LOOK_MINERALS),
});

// Register LOOK_ type for `Mineral`
const look = registerLook<Mineral.Mineral>()(C.LOOK_MINERALS);
declare module 'xxscreeps/game/room' {
	interface Find { mineral: typeof find }
	interface Look { mineral: typeof look }
}
