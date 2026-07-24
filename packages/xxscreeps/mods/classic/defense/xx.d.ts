declare module 'xxscreeps:mods/game' {
	import type { DefenseRoomSchemas } from 'xxscreeps/mods/classic/defense/game.js';

	interface ConstructionCost {
		constructedWall: 1;
		rampart: 1;
		tower: 5000;
	}
	interface RoomSchema { defense: DefenseRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { DefenseIntents } from 'xxscreeps/mods/classic/defense/processor.js';

	interface Intent { defense: DefenseIntents }
}
