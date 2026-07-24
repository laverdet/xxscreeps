declare module 'xxscreeps:mods/game' {
	import type { WallStreetTerminalRoomSchema } from 'xxscreeps/mods/mmo/wallstreet/schema.js';

	interface StructureTerminalSchema { wallstreet: [ WallStreetTerminalRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { WallStreetIntents } from 'xxscreeps/mods/mmo/wallstreet/processor.js';

	interface Intent { wallstreet: WallStreetIntents }
}
