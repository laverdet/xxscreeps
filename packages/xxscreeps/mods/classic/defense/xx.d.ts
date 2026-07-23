declare module 'xxscreeps:mods/game' {
	import type { DefenseRoomSchemas } from 'xxscreeps/mods/classic/defense/game.js';

	interface RoomSchema { defense: DefenseRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { DefenseIntents } from 'xxscreeps/mods/classic/defense/processor.js';

	interface Intent { defense: DefenseIntents }
}
