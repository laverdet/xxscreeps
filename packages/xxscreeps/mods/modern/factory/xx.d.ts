declare module 'xxscreeps:mods/game' {
	import type { FactoryRoomSchema } from 'xxscreeps/mods/modern/factory/game.js';

	interface RoomSchema { factory: [ FactoryRoomSchema ] }
}
