declare module 'xxscreeps:mods/game' {
	import type { HarvestableRoomSchema } from 'xxscreeps/mods/classic/harvestable/schema.js';

	enum ActionLogSchema {
		harvest = 'harvest',
	}
	interface RoomSchema { harvestable: HarvestableRoomSchema }
}
