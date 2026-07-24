import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureController } from './controller.js';
import { controllerShape, roomSchema } from './schema.js';
import './creep.js';

RoomObject.prototype['#roomStatusDidChange'] = function(_level: number, _userId: string | null | undefined) {};

hooks.register('gameInitializer', (Game, payload) => {
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

// Export `StructureController` to runtime globals
registerGlobal(StructureController);

export type ControllerRoomSchemas = [ typeof roomSchema, typeof controllerSchema ];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const controllerSchema = registerVariant('Room.objects', compose(controllerShape, StructureController));

// ---

declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * Your [Global Control Level](https://docs.screeps.com/control.html#Global-Control-Level).
		 * @public
		 * @see https://docs.screeps.com/api/#Game.gcl
		 */
		gcl: {
			/**
			 * The current level.
			 * @public
			 */
			level: number;

			/**
			 * The current progress to the next level.
			 * @public
			 */
			progress: number;

			/**
			 * The progress required to reach the next level.
			 * @public
			 */
			progressTotal: number;

			['#roomCount']: number;
		};
	}
}

declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		'#roomStatusDidChange'(level: number, userId: string | null | undefined): void;
	}
}

declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureController: typeof StructureController }
}
