import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { PowerCreep, read } from './powercreep.js';

let roster: PowerCreep[] = [];

// Materialize the roster blob the driver sends: once on boot, then again whenever a mutation lands.
hooks.register('runtimeConnector', {
	initialize(payload) {
		roster = payload.powerCreepsBlob ? read(payload.powerCreepsBlob) : [];
	},

	receive(payload) {
		if (payload.powerCreepsBlob !== undefined) {
			roster = payload.powerCreepsBlob ? read(payload.powerCreepsBlob) : [];
		}
	},
});

// Add `powerCreeps` to the global `Game` object, keyed by name (including unspawned creeps).
declare module 'xxscreeps/game/game.js' {
	interface Game {
		/** A hash containing all your power creeps with their names as hash keys. */
		powerCreeps: Record<string, PowerCreep>;
	}
}
hooks.register('gameInitializer', Game => {
	Game.powerCreeps = Object.create(null) as Record<string, PowerCreep>;
	for (const creep of roster) {
		Game.powerCreeps[creep.name] = creep;
	}
});

registerGlobal(PowerCreep);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { PowerCreep: typeof PowerCreep }
}
