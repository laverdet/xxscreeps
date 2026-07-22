declare module 'xxscreeps:mods/game' {
	import type { InvaderRoomSchema } from 'xxscreeps/mods/invader/game.js';
	import type { InvaderSchemaRoomSchema } from 'xxscreeps/mods/invader/schema.js';

	interface RoomSchema { invader: [ InvaderRoomSchema, InvaderSchemaRoomSchema ] }
}
