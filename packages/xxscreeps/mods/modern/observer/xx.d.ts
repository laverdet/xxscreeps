declare module 'xxscreeps:mods/game' {
	import type { ObserverRoomSchemas } from 'xxscreeps/mods/modern/observer/game.js';

	interface RoomSchema { observer: ObserverRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { ObserverIntents } from 'xxscreeps/mods/modern/observer/processor.js';

	interface Intent { observer: ObserverIntents }
}
