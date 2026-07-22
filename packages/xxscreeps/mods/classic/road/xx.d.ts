declare module 'xxscreeps:mods/game' {
	import type { RoadRoomSchema } from 'xxscreeps/mods/classic/road/game.js';

	interface RoomSchema { road: RoadRoomSchema }
}
