declare module 'xxscreeps:mods/game' {
	import type { ControllerRoomSchemas } from 'xxscreeps/mods/classic/controller/game.js';
	import type { ControllerEventRoomSchemas } from 'xxscreeps/mods/classic/controller/schema.js';

	enum ActionLogSchema {
		reserveController = 'reserveController',
		upgradeController = 'upgradeController',
	}
	interface RoomSchema { controller: [ ...ControllerRoomSchemas, ...ControllerEventRoomSchemas ] }
}
