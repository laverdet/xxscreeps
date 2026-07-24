declare module 'xxscreeps:mods/game' {
	import type { RoadRoomSchema } from 'xxscreeps/mods/classic/road/game.js';

	interface ConstructionCost { road: 300 }
	interface RoomSchema { road: RoadRoomSchema }
}
