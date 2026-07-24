declare module 'xxscreeps:mods/game' {
	import type { SourceFind, SourceLook, SourceRoomSchemas } from 'xxscreeps/mods/classic/source/game.js';
	import type { SourceSchemaRoomSchema } from 'xxscreeps/mods/classic/source/schema.js';

	interface Find { source: SourceFind }
	interface Look { source: SourceLook }
	interface RoomSchema { source: [ ...SourceRoomSchemas, SourceSchemaRoomSchema ] }
}
