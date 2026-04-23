import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import * as Container from './container.js';
import * as Resource from './resource.js';
import { Store } from './store.js';

// Export `StructureContainer`, `Resource` & `Store` to runtime globals
registerGlobal(Container.StructureContainer);
registerGlobal(Resource.Resource);
registerGlobal(Store);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		Resource: typeof Resource.Resource;
		StructureContainer: typeof Container.StructureContainer;
		Store: typeof Store;
	}
}

// Register FIND_ types for `Resource`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_DROPPED_RESOURCES]: room => room['#lookFor'](C.LOOK_RESOURCES),
});

// Register LOOK_ type for `Resource`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Resource.Resource>()(C.LOOK_RESOURCES);
declare module 'xxscreeps/game/room/index.js' {
	interface Find { resource: typeof find }
	interface Look { resource: typeof look }
}

// These need to be declared separately I guess
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const containerSchema = registerVariant('Room.objects', Container.format);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const resourceSchema = registerVariant('Room.objects', Resource.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { resource: [ typeof containerSchema, typeof resourceSchema ] }
}
