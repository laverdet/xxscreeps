declare module 'xxscreeps:mods/game' {
	import type { SpawnFind, SpawnRoomSchemas } from 'xxscreeps/mods/classic/spawn/game.js';

	interface Find { spawn: SpawnFind }
	interface RoomSchema { spawn: SpawnRoomSchemas }
}
