declare module 'xxscreeps:mods/game' {
	import type { PowerbankRoomSchema } from 'xxscreeps/mods/modern/powerbank/game.js';
	import type { StructurePowerBank } from 'xxscreeps/mods/modern/powerbank/powerbank.js';
	import type { PowerbankSchemaRoomSchema } from 'xxscreeps/mods/modern/powerbank/schema.js';

	enum ResourceSchema {
		RESOURCE_POWER = 'power',
	}
	interface RoomObjects { powerBank: StructurePowerBank }
	interface RoomSchema { powerbank: [ PowerbankRoomSchema, PowerbankSchemaRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { PowerBankIntents } from 'xxscreeps/mods/modern/powerbank/processor.js';

	interface Intent { powerBank: PowerBankIntents }
}
