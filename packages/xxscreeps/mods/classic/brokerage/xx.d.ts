declare module 'xxscreeps:mods/game' {
	import type { TerminalRoomSchema } from 'xxscreeps/mods/classic/brokerage/game.js';

	interface RoomSchema { terminal: TerminalRoomSchema }
}
