declare module 'xxscreeps:mods/game' {
	import type { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
	import type { ControllerRoomSchemas } from 'xxscreeps/mods/classic/controller/game.js';
	import type { AttackControllerEventType, ControllerEventRoomSchemas, ReserveControllerEventType, UpgradeControllerEventType } from 'xxscreeps/mods/classic/controller/schema.js';

	enum ActionLogSchema {
		reserveController = 'reserveController',
		upgradeController = 'upgradeController',
	}
	interface EventLog {
		attackController: AttackControllerEventType;
		reserveController: ReserveControllerEventType;
		upgradeController: UpgradeControllerEventType;
	}
	interface RoomObjects { controller: StructureController }
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
