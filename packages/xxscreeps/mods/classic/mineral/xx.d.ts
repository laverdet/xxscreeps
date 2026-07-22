declare module 'xxscreeps:mods/game' {
	import type { MineralFind, MineralLook, MineralRoomSchemas } from 'xxscreeps/mods/classic/mineral/game.js';

	interface Find { mineral: MineralFind }
	interface Look { mineral: MineralLook }
	interface RoomSchema { mineral: MineralRoomSchemas }
}
