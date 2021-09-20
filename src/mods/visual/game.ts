import { hooks, registerGlobal } from 'xxscreeps/game';
import { GameMap } from 'xxscreeps/game/map';
import { Room } from 'xxscreeps/game/room';
import { extend } from 'xxscreeps/utility/utility';
import { RoomVisual, flush } from './visual';

// Export `RoomVisual` to runtime globals
registerGlobal(RoomVisual);
declare module 'xxscreeps/game/runtime' {
	interface Global { RoomVisual: typeof RoomVisual }
}
registerGlobal(RoomVisual);

// Receive and send visuals payload from driver
hooks.register('runtimeConnector', {
	send(payload) {
		payload.visuals = flush();
	},
});

// Add `Room#visual` getter
declare module 'xxscreeps/game/room' {
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

declare module 'xxscreeps/game/map' {
	interface GameMap {
		/**
		 * A `RoomVisual` object for the map. You can use this object to draw simple shapes (lines,
		 * circles, text labels).
		 */
		readonly visual: RoomVisual;
	}
}

extend(GameMap, {
	visual: {
		get() {
			const value = new RoomVisual('map');
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
