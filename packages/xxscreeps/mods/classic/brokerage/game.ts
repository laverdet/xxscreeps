import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { terminalShape } from './schema.js';
import { StructureTerminal } from './terminal.js';

// Export `StructureTerminal` to runtime globals
registerGlobal(StructureTerminal);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const terminalSchema = registerVariant('Room.objects', compose(terminalShape, StructureTerminal));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureTerminal: typeof StructureTerminal }
}

declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		/**
		 * The Terminal structure of this room, if present, otherwise undefined.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.terminal
		 */
		terminal?: StructureTerminal | undefined;
	}

	interface RoomSchema { terminal: typeof terminalSchema }
}
