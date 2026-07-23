declare module 'xxscreeps:mods/game' {
	import type { HarvestableRoomSchema } from 'xxscreeps/mods/classic/harvestable/schema.js';

	enum ActionLogSchema {
		harvest = 'harvest',
	}
	interface RoomSchema { harvestable: HarvestableRoomSchema }
}

declare module 'xxscreeps:mods/processor' {
	import type { HarvestableIntents } from 'xxscreeps/mods/classic/harvestable/processor.js';

	interface Intent { harvestable: HarvestableIntents }
}
