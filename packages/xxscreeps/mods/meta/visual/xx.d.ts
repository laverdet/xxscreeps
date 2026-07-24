declare module 'xxscreeps:mods/game' {
	import type { RoomVisual } from 'xxscreeps/mods/meta/visual/visual.js';

	interface Room {
		/**
		 * A [RoomVisual](https://docs.screeps.com/api/#RoomVisual) object for this room. You can use
		 * this object to draw simple shapes (lines, circles, text labels) in the room.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.visual
		 */
		readonly visual: RoomVisual;
	}
}
