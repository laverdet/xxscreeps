declare module 'xxscreeps:mods/game' {
	import type { TerminalRoomSchema } from 'xxscreeps/mods/classic/brokerage/game.js';

	interface RoomSchema { terminal: TerminalRoomSchema }

	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface StructureTerminalSchema {}
}
