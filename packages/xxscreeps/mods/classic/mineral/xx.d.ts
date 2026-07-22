declare module 'xxscreeps:mods/game' {
	import type { MineralFind, MineralLook, MineralRoomSchemas } from 'xxscreeps/mods/classic/mineral/game.js';

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
	interface Find { mineral: MineralFind }
	interface Look { mineral: MineralLook }
	interface RoomSchema { mineral: MineralRoomSchemas }
}
