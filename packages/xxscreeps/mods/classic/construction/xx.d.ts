declare module 'xxscreeps:mods/game' {
	import type { ConstructionRoomSchema } from 'xxscreeps/mods/classic/construction/game.js';
	import type { ConstructionFind, ConstructionLook } from 'xxscreeps/mods/classic/construction/room.js';
	import type { ConstructionEventRoomSchemas } from 'xxscreeps/mods/classic/construction/schema.js';

	enum ActionLogSchema {
		build = 'build',
		repair = 'repair',
	}
	interface Find { construction: ConstructionFind }
	interface Look { construction: ConstructionLook }
	interface RoomSchema { construction: [ ConstructionRoomSchema, ...ConstructionEventRoomSchemas ] }
}
