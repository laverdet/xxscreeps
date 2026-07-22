declare module 'xxscreeps:mods/game' {
	import type { CreepFind, CreepLook, CreepRoomSchemas } from 'xxscreeps/mods/classic/creep/game.js';
	import type { CreepEventRoomSchemas } from 'xxscreeps/mods/classic/creep/schema.js';

	interface Find { creep: CreepFind }
	interface Look { creep: CreepLook }
	interface RoomSchema { creep: [ ...CreepRoomSchemas, ...CreepEventRoomSchemas ] }
}
