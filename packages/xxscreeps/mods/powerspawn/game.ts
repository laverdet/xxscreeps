import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import * as PowerSpawn from './powerspawn.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const powerSpawnSchema = registerVariant('Room.objects', PowerSpawn.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { powerspawn: [ typeof powerSpawnSchema ] }
}

// Save `Game.gpl` from driver
declare module 'xxscreeps/game/game.js' {
	interface Game {
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

registerGlobal(PowerSpawn.StructurePowerSpawn);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructurePowerSpawn: typeof PowerSpawn.StructurePowerSpawn }
}
