declare module 'xxscreeps:mods/game' {
	import type { ResourceFind, ResourceLook, ResourceRoomSchemas } from 'xxscreeps/mods/classic/resource/game.js';

	enum ResourceSchema {
		RESOURCE_ENERGY = 'energy',
	}
	interface ConstructionCost { container: 5000 }
	interface Find { resource: ResourceFind }
	interface Look { resource: ResourceLook }
	interface RoomSchema { resource: ResourceRoomSchemas }
}
