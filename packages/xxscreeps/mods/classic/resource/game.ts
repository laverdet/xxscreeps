import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureContainer } from './container.js';
import { Resource, resourceShape } from './resource.js';
import { containerShape } from './schema.js';
import { Store } from './store.js';

// Export `StructureContainer`, `Resource` & `Store` to runtime globals
registerGlobal(StructureContainer);
registerGlobal(Resource);
registerGlobal(Store);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		Resource: typeof Resource;
		StructureContainer: typeof StructureContainer;
		Store: typeof Store;
	}
}

// Set up default value for all resources on `Store`
hooks.register('environment', () => {
	for (const resourceType of C.RESOURCES_ALL) {
		Object.defineProperty(Store.prototype, resourceType, { value: 0, writable: true });
	}
});

// Register FIND_ types for `Resource`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_DROPPED_RESOURCES]: room => room['#lookFor'](C.LOOK_RESOURCES),
});

// Register LOOK_ type for `Resource`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Resource>()(C.LOOK_RESOURCES);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const lookEnergy = registerLook<Resource>()(C.LOOK_ENERGY);

// These need to be declared separately I guess
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const containerSchema = registerVariant('Room.objects', compose(containerShape, StructureContainer));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const resourceSchema = registerVariant('Room.objects', compose(resourceShape, Resource));

// ---

declare module 'xxscreeps:mods/game' {
	interface Find { resource: typeof find }
	interface Look {
		resource: typeof look;
		energy: typeof lookEnergy;
	}
	interface RoomSchema { resource: [ typeof containerSchema, typeof resourceSchema ] }
}
