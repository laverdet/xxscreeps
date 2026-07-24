declare module 'xxscreeps:mods/game' {
	import type { RoadRoomSchema } from 'xxscreeps/mods/classic/road/game.js';
	import type { StructureRoad } from 'xxscreeps/mods/classic/road/road.js';

	interface ConstructionCost { road: 300 }
	interface RoomObjects { road: StructureRoad }
	interface RoomSchema { road: RoadRoomSchema }
}
