declare module 'xxscreeps:mods/game' {
	import type { PowerCreepFind, PowerCreepLook, PowerCreepRoomSchema } from 'xxscreeps/mods/mmo/powercreep/game.js';
	import type { PowerCreep } from 'xxscreeps/mods/mmo/powercreep/powercreep.js';

	interface Find { powerCreep: PowerCreepFind }
	interface Look { powerCreep: PowerCreepLook }
	interface RoomObjects { powerCreep: PowerCreep }
	interface RoomSchema { powerCreep: [ PowerCreepRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { PowerCreepIntents } from 'xxscreeps/mods/mmo/powercreep/processor.js';

	interface Intent { powerCreep: PowerCreepIntents }
}
