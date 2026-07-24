declare module 'xxscreeps:mods/game' {
	import type { StructureExtension } from 'xxscreeps/mods/classic/spawn/extension.js';
	import type { SpawnFind, SpawnRoomSchemas } from 'xxscreeps/mods/classic/spawn/game.js';
	import type { StructureSpawn } from 'xxscreeps/mods/classic/spawn/spawn.js';

	interface ConstructionCost {
		extension: 3000;
		spawn: 15000;
	}
	interface Find { spawn: SpawnFind }
	interface RoomObjects {
		extension: StructureExtension;
		spawn: StructureSpawn;
	}
	interface RoomSchema { spawn: SpawnRoomSchemas }

	interface Room {
		/**
		 * Total amount of energy available in all spawns and extensions in the room.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.energyAvailable
		 */
		energyAvailable: number;

		/**
		 * Total amount of `energyCapacity` of all spawns and extensions in the room.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.energyCapacityAvailable
		 */
		energyCapacityAvailable: number;
	}
}

declare module 'xxscreeps:mods/processor' {
	import type { SpawnIntents } from 'xxscreeps/mods/classic/spawn/processor.js';

	interface Intent { spawn: SpawnIntents }
}
