declare module 'xxscreeps:mods/game' {
	import type { PowerCreepFind, PowerCreepLook, PowerCreepRoomSchema } from 'xxscreeps/mods/mmo/powercreep/game.js';

	interface Find { powerCreep: PowerCreepFind }
	interface Look { powerCreep: PowerCreepLook }
	interface RoomSchema { powerCreep: [ PowerCreepRoomSchema ] }
}
