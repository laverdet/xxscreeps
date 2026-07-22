declare module 'xxscreeps:mods/game' {
	import type { WallStreetTerminalRoomSchema } from 'xxscreeps/mods/mmo/wallstreet/schema.js';

	interface StructureTerminalSchema { wallstreet: [ WallStreetTerminalRoomSchema ] }
}
