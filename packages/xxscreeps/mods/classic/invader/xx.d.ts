declare module 'xxscreeps:mods/game' {
	import type { InvaderRoomSchema } from 'xxscreeps/mods/classic/invader/game.js';
	import type { InvaderSchemaRoomSchema } from 'xxscreeps/mods/classic/invader/schema.js';

	interface RoomSchema { invader: [ InvaderRoomSchema, InvaderSchemaRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { InvaderIntents } from 'xxscreeps/mods/classic/invader/processor.js';

	interface Intent { invader: InvaderIntents }
}
