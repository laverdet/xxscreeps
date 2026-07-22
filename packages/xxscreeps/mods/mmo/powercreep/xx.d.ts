declare module 'xxscreeps:mods/game' {
	import type { PowerCreepFind, PowerCreepLook, PowerCreepRoomSchema } from 'xxscreeps/mods/mmo/powercreep/game.js';

	enum ResourceSchema {
		RESOURCE_POWER = 'power',
	}
	interface Find { powerCreep: PowerCreepFind }
	interface Look { powerCreep: PowerCreepLook }
	interface RoomSchema { powerCreep: [ PowerCreepRoomSchema ] }
}
