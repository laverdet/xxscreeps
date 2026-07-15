import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructurePowerSpawn } from './powerspawn.js';
import { powerSpawnShape } from './schema.js';

hooks.register('gameInitializer', (Game, payload) => {
	if (payload) {
		const level = Math.floor((payload.power / C.POWER_LEVEL_MULTIPLY) ** (1 / C.POWER_LEVEL_POW));
		const base = level ** C.POWER_LEVEL_POW * C.POWER_LEVEL_MULTIPLY;
		Game.gpl = {
			level,
			progress: payload.power - base,
			progressTotal: (level + 1) ** C.POWER_LEVEL_POW * C.POWER_LEVEL_MULTIPLY - base,
		};
	}
});

registerGlobal(StructurePowerSpawn);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const powerSpawnSchema = registerVariant('Room.objects', compose(powerSpawnShape, StructurePowerSpawn));

// ---

declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * Your Global Power Level, an object with the following properties: `level` — the current
		 * level; `progress` — the current progress to the next level; `progressTotal` — the progress
		 * required to reach the next level.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.gpl
		 */
		gpl: {
			/**
			 * The current Global Power Level.
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
		};
	}
}

declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructurePowerSpawn: typeof StructurePowerSpawn }
}

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { powerspawn: [ typeof powerSpawnSchema ] }
}
