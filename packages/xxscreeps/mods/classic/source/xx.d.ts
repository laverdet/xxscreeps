declare module 'xxscreeps:mods/game' {
	import type { SourceFind, SourceLook, SourceRoomSchemas } from 'xxscreeps/mods/classic/source/game.js';
	import type { StructureKeeperLair } from 'xxscreeps/mods/classic/source/keeper-lair.js';
	import type { SourceSchemaRoomSchema } from 'xxscreeps/mods/classic/source/schema.js';
	import type { Source } from 'xxscreeps/mods/classic/source/source.js';

	interface Find { source: SourceFind }
	interface Look { source: SourceLook }
	interface RoomObjects {
		keeperLair: StructureKeeperLair;
		source: Source;
	}
	interface RoomSchema { source: [ ...SourceRoomSchemas, SourceSchemaRoomSchema ] }
}
