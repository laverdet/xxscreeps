declare module 'xxscreeps:mods/game' {
	import type { LogisticsRoomSchemas } from 'xxscreeps/mods/classic/logistics/game.js';

	enum ActionLogSchema {
		transferEnergy = 'transferEnergy',
	}
	interface RoomSchema { logistics: LogisticsRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { LogisticsIntents } from 'xxscreeps/mods/classic/logistics/processor.js';

	interface Intent { logistics: LogisticsIntents }
}
