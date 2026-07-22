declare module 'xxscreeps:mods/game' {
	import type { PowerbankRoomSchema } from 'xxscreeps/mods/modern/powerbank/game.js';
	import type { PowerbankSchemaRoomSchema } from 'xxscreeps/mods/modern/powerbank/schema.js';

	enum ResourceSchema {
		RESOURCE_POWER = 'power',
	}
	interface RoomSchema { powerbank: [ PowerbankRoomSchema, PowerbankSchemaRoomSchema ] }
}
