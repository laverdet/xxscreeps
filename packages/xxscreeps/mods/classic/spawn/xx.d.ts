declare module 'xxscreeps:mods/game' {
	import type { SpawnFind, SpawnRoomSchemas } from 'xxscreeps/mods/classic/spawn/game.js';

	interface ConstructionCost {
		extension: 3000;
		spawn: 15000;
	}
	interface Find { spawn: SpawnFind }
	interface RoomSchema { spawn: SpawnRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { SpawnIntents } from 'xxscreeps/mods/classic/spawn/processor.js';

	interface Intent { spawn: SpawnIntents }
}
