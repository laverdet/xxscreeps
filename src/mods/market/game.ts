import { registerVariant } from 'xxscreeps/engine/schema';
import { registerGlobal } from 'xxscreeps/game';
import * as Terminal from './terminal';

// Export `StructureTerminal` to runtime globals
registerGlobal(Terminal.StructureTerminal);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureTerminal: typeof Terminal.StructureTerminal }
}

// Register schema
const terminalSchema = registerVariant('Room.objects', Terminal.format);
declare module 'xxscreeps/game/room' {
	interface Room {
		terminal?: Terminal.StructureTerminal;
	}

	interface Schema { terminal: typeof terminalSchema }
}
