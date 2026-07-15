import { hooks } from 'xxscreeps/game/index.js';
import { INTERSHARD_RESOURCES } from './constants.js';

// Register `Game.resources`
declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * An object with your global resources that are bound to the account, like pixels or cpu
		 * unlocks. Each object key is a resource constant, values are resources amounts.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.resources
		 */
		resources: Record<string, number>;
	}
}
hooks.register('gameInitializer', Game => {
	Game.resources = Object.create(null);
	for (const key of INTERSHARD_RESOURCES) {
		Game.resources[key] = 0;
	}
});
