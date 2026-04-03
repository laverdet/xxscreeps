import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { GameMap } from 'xxscreeps/game/map.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { MapVisual, RoomVisual, flush } from './visual.js';

// Export `RoomVisual` and `MapVisual` to runtime globals
registerGlobal(RoomVisual);
registerGlobal(MapVisual);
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		RoomVisual: typeof RoomVisual;
		MapVisual: typeof MapVisual;
	}
}

// Receive and send visuals payload from driver
hooks.register('runtimeConnector', {
	send(payload) {
		payload.visuals = flush();
	},
});

// Add `Room#visual` getter
declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		/**
		 * A `RoomVisual` object for this room. You can use this object to draw simple shapes (lines,
		 * circles, text labels) in the room.
		 */
		readonly visual: RoomVisual;
	}
}

extend(Room, {
	visual: {
		get() {
			const value = new RoomVisual(this.name);
			Object.defineProperty(this, 'visual', { value });
			return value;
		},
	},
});

declare module 'xxscreeps/game/map.js' {
	interface GameMap {
		/**
		 * A `MapVisual` object for the map. You can use this object to draw simple shapes (lines,
		 * circles, text labels).
		 */
		readonly visual: MapVisual;
	}
}

extend(GameMap, {
	visual: {
		get() {
			const value = new MapVisual();
			Object.defineProperty(this, 'visual', {
				value,
				configurable: true,
			});
			return value;
		},
	},
});

// Delete cached RoomVisual instance each tick
hooks.register('gameInitializer', Game => {
	const map: any = Game.map;
	delete map.visual;
});
