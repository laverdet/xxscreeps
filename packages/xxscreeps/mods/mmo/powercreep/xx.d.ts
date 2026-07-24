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

declare module 'xxscreeps:mods/processor' {
	import type { PowerCreepIntents } from 'xxscreeps/mods/mmo/powercreep/processor.js';

	interface Intent { powerCreep: PowerCreepIntents }
}
