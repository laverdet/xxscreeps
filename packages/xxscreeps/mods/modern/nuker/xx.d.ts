declare module 'xxscreeps:mods/game' {
	import type { NukerFind, NukerLook, NukerRoomSchemas } from 'xxscreeps/mods/modern/nuker/game.js';

	interface Find { nuker: NukerFind }
	interface Look { nuker: NukerLook }
	interface RoomSchema { nuker: NukerRoomSchemas }
}
