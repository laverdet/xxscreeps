declare module 'xxscreeps:mods/game' {
	import type { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
	import type { ControllerRoomSchemas } from 'xxscreeps/mods/classic/controller/game.js';
	import type { ControllerEventRoomSchemas } from 'xxscreeps/mods/classic/controller/schema.js';

	enum ActionLogSchema {
		reserveController = 'reserveController',
		upgradeController = 'upgradeController',
	}
	interface RoomSchema { controller: [ ...ControllerRoomSchemas, ...ControllerEventRoomSchemas ] }

	interface Room {
		/**
		 * The Controller structure of this room, if present, otherwise undefined.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.controller
		 */
		controller?: StructureController | undefined;
	}
}

declare module 'xxscreeps:mods/processor' {
	import type { ControllerIntents } from 'xxscreeps/mods/classic/controller/processor.js';

	interface Intent { controller: ControllerIntents }
}
