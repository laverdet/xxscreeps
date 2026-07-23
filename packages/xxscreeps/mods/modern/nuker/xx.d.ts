declare module 'xxscreeps:mods/game' {
	import type { NukerFind, NukerLook, NukerRoomSchemas } from 'xxscreeps/mods/modern/nuker/game.js';

	interface Find { nuker: NukerFind }
	interface Look { nuker: NukerLook }
	interface RoomSchema { nuker: NukerRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { NukerIntents } from 'xxscreeps/mods/modern/nuker/processor.js';

	interface Intent { nuker: NukerIntents }
}
