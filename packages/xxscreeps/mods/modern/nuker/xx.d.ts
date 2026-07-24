declare module 'xxscreeps:mods/game' {
	import type { NukerFind, NukerLook, NukerRoomSchemas } from 'xxscreeps/mods/modern/nuker/game.js';
	import type { Nuke } from 'xxscreeps/mods/modern/nuker/nuke.js';
	import type { StructureNuker } from 'xxscreeps/mods/modern/nuker/nuker.js';

	interface ConstructionCost { nuker: 100000 }
	interface Find { nuker: NukerFind }
	interface Look { nuker: NukerLook }
	interface RoomObjects {
		nuke: Nuke;
		nuker: StructureNuker;
	}
	interface RoomSchema { nuker: NukerRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { NukerIntents } from 'xxscreeps/mods/modern/nuker/processor.js';

	interface Intent { nuker: NukerIntents }
}
