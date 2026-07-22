declare module 'xxscreeps:mods/game' {
	import type { EnergyLook, ResourceFind, ResourceLook, ResourceRoomSchemas } from 'xxscreeps/mods/classic/resource/game.js';

	interface Find { resource: ResourceFind }
	interface Look {
		resource: ResourceLook;
		energy: EnergyLook;
	}
	interface RoomSchema { resource: ResourceRoomSchemas }
}
