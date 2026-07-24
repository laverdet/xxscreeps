declare module 'xxscreeps:mods/game' {
	import type { ObserverRoomSchemas } from 'xxscreeps/mods/modern/observer/game.js';

	interface ConstructionCost { observer: 8000 }
	interface RoomSchema { observer: ObserverRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { ObserverIntents } from 'xxscreeps/mods/modern/observer/processor.js';

	interface Intent { observer: ObserverIntents }
}
