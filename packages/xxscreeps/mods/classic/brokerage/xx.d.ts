declare module 'xxscreeps:mods/game' {
	import type { TerminalRoomSchema } from 'xxscreeps/mods/classic/brokerage/game.js';
	import type { StructureTerminal } from 'xxscreeps/mods/classic/brokerage/terminal.js';

	interface ConstructionCost { terminal: 100000 }
	interface RoomSchema { terminal: TerminalRoomSchema }

	interface Room {
		/**
		 * The Terminal structure of this room, if present, otherwise undefined.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.terminal
		 */
		terminal?: StructureTerminal | undefined;
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface StructureTerminalSchema {}
}

declare module 'xxscreeps:mods/processor' {
	import type { BrokerageIntents } from 'xxscreeps/mods/classic/brokerage/processor.js';

	interface Intent { brokerage: BrokerageIntents }
}
