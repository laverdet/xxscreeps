import * as C from 'xxscreeps/game/constants';
import * as Controller from './controller';
import * as Id from 'xxscreeps/engine/schema/id';
import { registerEnumerated, registerStruct, registerVariant } from 'xxscreeps/engine/schema';
import { registerGameInitializer, registerGlobal } from 'xxscreeps/game';
import { optional, struct } from 'xxscreeps/schema';
import { hooks } from 'xxscreeps/driver';
import { acquireControllerActivity } from './creep';

// Register schema
const roomSchema = registerStruct('Room', {
	'#level': 'int32',
	'#safeModeUntil': 'int32',
	'#sign': optional(struct({
		datetime: 'double',
		text: 'string',
		time: 'int32',
		userId: Id.format,
	})),
	'#user': Id.optionalFormat,
});
const controllerSchema = registerVariant('Room.objects', Controller.format);
declare module 'xxscreeps/game/room' {
	interface Schema { controller: [ typeof roomSchema, typeof controllerSchema ] }
}

const actionSchema = registerEnumerated('ActionLog.action', 'reserveController', 'upgradeController');
declare module 'xxscreeps/game/object' {
	interface Schema { controller: typeof actionSchema }
}

// Save `Game.gcl` from driver
declare module 'xxscreeps/game/game' {
	interface Game {
		gcl: {
			/**
			 * The current GCL level.
			 */
			level: number;

			/**
			 * The current progress to the next level.
			 */
			progress: number;

			/**
			 * The progress required to reach the next level.
			 */
			progressTotal: number;

			['#roomCount']: number;
		};
	}
}

registerGameInitializer((Game, payload) => {
	if (payload) {
		const level = Math.floor((payload.gcl / C.GCL_MULTIPLY) ** (1 / C.GCL_POW));
		const progress = Math.floor(level ** C.GCL_POW * C.GCL_MULTIPLY);
		Game.gcl = {
			level: level + 1,
			progress: payload.gcl - progress,
			progressTotal: Math.floor((level + 1) ** C.GCL_POW * C.GCL_MULTIPLY),
			'#roomCount': payload.controlledRoomCount,
		};
	}
});

hooks.register('runtimeConnector', {
	send(payload) {
		payload.controllerActivity = acquireControllerActivity();
	},
});

// Export `StructureController` to runtime globals
registerGlobal(Controller.StructureController);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureController: typeof Controller.StructureController }
}
