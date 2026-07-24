declare module 'xxscreeps:mods/game' {
	import type { LogisticsRoomSchemas } from 'xxscreeps/mods/classic/logistics/game.js';
	import type { StructureStorage } from 'xxscreeps/mods/classic/logistics/storage.js';

	enum ActionLogSchema {
		transferEnergy = 'transferEnergy',
	}
	interface ConstructionCost {
		link: 5000;
		storage: 30000;
	}
	interface RoomSchema { logistics: LogisticsRoomSchemas }

	interface Room {
		/**
		 * The Storage structure of this room, if present, otherwise undefined.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.storage
		 */
		storage: StructureStorage | undefined;
	}
}

declare module 'xxscreeps:mods/processor' {
	import type { LogisticsIntents } from 'xxscreeps/mods/classic/logistics/processor.js';

	interface Intent { logistics: LogisticsIntents }
}
