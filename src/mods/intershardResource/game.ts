import { hooks } from 'xxscreeps/game/index.js';
import { INTERSHARD_RESOURCES } from './constants.js';

// Register `Game.resources`
declare module 'xxscreeps/game/game' {
    interface Game {
        resources: { [key: string]: number };
    }
}
hooks.register('gameInitializer', Game => {
    Game.resources = Object.create(null);
    for (const key of INTERSHARD_RESOURCES) {
        Game.resources[key] = 0;
    }
});
