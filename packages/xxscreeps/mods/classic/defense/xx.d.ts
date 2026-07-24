declare module 'xxscreeps:mods/game' {
	import type { DefenseRoomSchemas } from 'xxscreeps/mods/classic/defense/game.js';
	import type { StructureRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
	import type { StructureTower } from 'xxscreeps/mods/classic/defense/tower.js';
	import type { StructureWall } from 'xxscreeps/mods/classic/defense/wall.js';

	interface ConstructionCost {
		constructedWall: 1;
		rampart: 1;
		tower: 5000;
	}
	interface RoomObjects {
		constructedWall: StructureWall;
		rampart: StructureRampart;
		tower: StructureTower;
	}
	interface RoomSchema { defense: DefenseRoomSchemas }
}

declare module 'xxscreeps:mods/processor' {
	import type { DefenseIntents } from 'xxscreeps/mods/classic/defense/processor.js';

	interface Intent { defense: DefenseIntents }
}
