declare module 'xxscreeps:mods/game' {
	import type { PowerspawnRoomSchema } from 'xxscreeps/mods/modern/powerspawn/game.js';
	import type { StructurePowerSpawn } from 'xxscreeps/mods/modern/powerspawn/powerspawn.js';

	interface ConstructionCost { powerSpawn: 100000 }
	interface RoomObjects { powerSpawn: StructurePowerSpawn }
	interface RoomSchema { powerspawn: [ PowerspawnRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { PowerspawnIntents } from 'xxscreeps/mods/modern/powerspawn/processor.js';

	interface Intent { powerspawn: PowerspawnIntents }
}
