declare module 'xxscreeps:mods/game' {
	import type { StructureFind, StructureLook, StructureRoomSchema } from 'xxscreeps/mods/classic/structure/game.js';
	import type { StructureSchemaRoomSchema } from 'xxscreeps/mods/classic/structure/schema.js';

	interface Find { structure: StructureFind }
	interface Look { structure: StructureLook }
	interface RoomSchema { structure: [ StructureRoomSchema, StructureSchemaRoomSchema ] }
}
