declare module 'xxscreeps:mods/game' {
	import type { StrongholdRoomSchema } from 'xxscreeps/mods/modern/stronghold/game.js';

	interface RoomSchema { stronghold: [ StrongholdRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { StrongholdIntents } from 'xxscreeps/mods/modern/stronghold/processor.js';

	interface Intent { stronghold: StrongholdIntents }
}
