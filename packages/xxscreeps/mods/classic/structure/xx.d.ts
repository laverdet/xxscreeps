declare module 'xxscreeps:mods/game' {
	import type { StructureFind, StructureLook, StructureRoomSchema } from 'xxscreeps/mods/classic/structure/game.js';
	import type { Ruin } from 'xxscreeps/mods/classic/structure/ruin.js';
	import type { DestroyedEventType, StructureSchemaRoomSchema } from 'xxscreeps/mods/classic/structure/schema.js';

	interface EventLog { objectDestroyed: DestroyedEventType }
	interface Find { structure: StructureFind }
	interface Look { structure: StructureLook }
	interface RoomObjects { ruin: Ruin }
	interface RoomSchema { structure: [ StructureRoomSchema, StructureSchemaRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { StructureIntents } from 'xxscreeps/mods/classic/structure/processor.js';

	interface Intent { structure: StructureIntents }
}
