import { registerGlobal } from 'xxscreeps/game';

export class RoomVisual {
	clear() {}
	getSize() {}

	line() {}
	circle() {}
	poly() {}
	rect() {}
	text() {}
}

// Export `RoomVisual` to runtime globals
registerGlobal(RoomVisual);
declare module 'xxscreeps/game/runtime' {
	interface Global { RoomVisual: RoomVisual }
}
