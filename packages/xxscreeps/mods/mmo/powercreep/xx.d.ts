declare module 'xxscreeps:mods/game' {
	import type { PowerCreepFind, PowerCreepLook, PowerCreepRoomSchema } from 'xxscreeps/mods/mmo/powercreep/game.js';
	import type { PowerCreepEventRoomSchemas } from 'xxscreeps/mods/mmo/powercreep/schema.js';

	enum ActionLogSchema {
		power = 'power',
	}
	interface Find { powerCreep: PowerCreepFind }
	interface Look { powerCreep: PowerCreepLook }
	interface RoomSchema { powerCreep: [ PowerCreepRoomSchema, ...PowerCreepEventRoomSchemas ] }
}
