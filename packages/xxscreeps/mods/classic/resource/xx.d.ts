declare module 'xxscreeps:mods/game' {
	import type { StructureContainer } from 'xxscreeps/mods/classic/resource/container.js';
	import type { ResourceFind, ResourceLook, ResourceRoomSchemas } from 'xxscreeps/mods/classic/resource/game.js';
	import type { Resource } from 'xxscreeps/mods/classic/resource/resource.js';

	enum ResourceSchema {
		RESOURCE_ENERGY = 'energy',
	}
	interface ConstructionCost { container: 5000 }
	interface Find { resource: ResourceFind }
	interface Look { resource: ResourceLook }
	interface RoomObjects {
		container: StructureContainer;
		resource: Resource;
	}
	interface RoomSchema { resource: ResourceRoomSchemas }
}
