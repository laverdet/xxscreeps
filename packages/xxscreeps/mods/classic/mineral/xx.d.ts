declare module 'xxscreeps:mods/game' {
	import type { StructureExtractor } from 'xxscreeps/mods/classic/mineral/extractor.js';
	import type { MineralFind, MineralLook, MineralRoomSchemas } from 'xxscreeps/mods/classic/mineral/game.js';
	import type { Mineral } from 'xxscreeps/mods/classic/mineral/mineral.js';

	enum ResourceSchema {
		RESOURCE_HYDROGEN = 'H',
		RESOURCE_OXYGEN = 'O',
		RESOURCE_UTRIUM = 'U',
		RESOURCE_LEMERGIUM = 'L',
		RESOURCE_KEANIUM = 'K',
		RESOURCE_ZYNTHIUM = 'Z',
		RESOURCE_CATALYST = 'X',
		RESOURCE_GHODIUM = 'G',
	}
	interface ConstructionCost { extractor: 5000 }
	interface Find { mineral: MineralFind }
	interface Look { mineral: MineralLook }
	interface RoomObjects {
		extractor: StructureExtractor;
		mineral: Mineral;
	}
	interface RoomSchema { mineral: MineralRoomSchemas }
}
