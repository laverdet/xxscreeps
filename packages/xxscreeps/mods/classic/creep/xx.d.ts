declare module 'xxscreeps:mods/game' {
	import type { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
	import type { CreepFind, CreepLook, CreepRoomSchemas } from 'xxscreeps/mods/classic/creep/game.js';
	import type { CreepEventRoomSchemas, ExitEventType, TransferEventType } from 'xxscreeps/mods/classic/creep/schema.js';
	import type { Tombstone } from 'xxscreeps/mods/classic/creep/tombstone.js';

	interface EventLog {
		exit: ExitEventType;
		transfer: TransferEventType;
	}
	interface Find { creep: CreepFind }
	interface Look { creep: CreepLook }
	interface RoomObjects {
		creep: Creep;
		tombstone: Tombstone;
	}
	interface RoomSchema { creep: [ ...CreepRoomSchemas, ...CreepEventRoomSchemas ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { CreepIntents } from 'xxscreeps/mods/classic/creep/processor.js';

	interface Intent { creep: CreepIntents }
}
