declare module 'xxscreeps:mods/game' {
	import type { LogisticsRoomSchemas } from 'xxscreeps/mods/classic/logistics/game.js';

	enum ActionLogSchema {
		transferEnergy = 'transferEnergy',
	}
	interface RoomSchema { logistics: LogisticsRoomSchemas }
}
