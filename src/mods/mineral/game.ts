import * as C from 'xxscreeps/game/constants';
import { registerSchema } from 'xxscreeps/engine/schema';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room';
import { enumerated } from 'xxscreeps/schema';
import * as Extractor from './extractor';
import * as Mineral from './mineral';

// Register schema extensions
const schema = [
	registerSchema('ResourceType', enumerated(
		C.RESOURCE_HYDROGEN, C.RESOURCE_OXYGEN,
		C.RESOURCE_UTRIUM, C.RESOURCE_LEMERGIUM, C.RESOURCE_KEANIUM,
		C.RESOURCE_ZYNTHIUM, C.RESOURCE_CATALYST, C.RESOURCE_GHODIUM,
	)),
	registerSchema('Room.objects', Extractor.format),
];
const schema2 = registerSchema('Room.objects', Mineral.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		mineral: typeof schema;
		mineral2: typeof schema2;
	}
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
