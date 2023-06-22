import C from 'xxscreeps/game/constants/index.js';
import * as Container from './container.js';
import * as Resource from './resource.js';
import { Store } from './store.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { registerVariant } from 'xxscreeps/engine/schema/index.js';

// Export `StructureContainer`, `Resource` & `Store` to runtime globals
registerGlobal(Container.StructureContainer);
registerGlobal(Resource.Resource);
registerGlobal(Store);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		Resource: typeof Resource.Resource;
		StructureContainer: typeof Container.StructureContainer;
		Store: typeof Store;
	}
}

// Register FIND_ types for `Resource`
const find = registerFindHandlers({
	[C.FIND_DROPPED_RESOURCES]: room => room['#lookFor'](C.LOOK_RESOURCES),
});

// Register LOOK_ type for `Resource`
const look = registerLook<Resource.Resource>()(C.LOOK_RESOURCES);
declare module 'xxscreeps/game/room' {
	interface Find { resource: typeof find }
	interface Look { resource: typeof look }
}

// These need to be declared separately I guess
const containerSchema = registerVariant('Room.objects', Container.format);
const resourceSchema = registerVariant('Room.objects', Resource.format);
declare module 'xxscreeps/game/room' {
	interface Schema { resource: [ typeof containerSchema, typeof resourceSchema ] }
}
