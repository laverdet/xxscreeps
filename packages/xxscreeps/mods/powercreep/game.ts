import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { PowerCreep } from './powercreep.js';

declare module 'xxscreeps/game/game.js' {
	interface Game {
		/** A hash containing all your power creeps with their names as hash keys. */
		powerCreeps: Record<string, PowerCreep>;
	}
}

hooks.register('gameInitializer', (Game, payload) => {
	Game.powerCreeps = Object.create(null) as Record<string, PowerCreep>;
	for (const record of payload?.powerCreeps ?? []) {
		Game.powerCreeps[record.name] = new PowerCreep(record);
	}
});

registerGlobal(PowerCreep);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { PowerCreep: typeof PowerCreep }
}
