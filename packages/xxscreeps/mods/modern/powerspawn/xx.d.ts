declare module 'xxscreeps:mods/game' {
	import type { PowerspawnRoomSchema } from 'xxscreeps/mods/modern/powerspawn/game.js';

	interface ConstructionCost { powerSpawn: 100000 }
	interface RoomSchema { powerspawn: [ PowerspawnRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { PowerspawnIntents } from 'xxscreeps/mods/modern/powerspawn/processor.js';

	interface Intent { powerspawn: PowerspawnIntents }
}
