import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { Market } from './market.js';
import * as Terminal from './terminal.js';

// Export `StructureTerminal` to runtime globals
registerGlobal(Terminal.StructureTerminal);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureTerminal: typeof Terminal.StructureTerminal }
}

// Register schema
const terminalSchema = registerVariant('Room.objects', Terminal.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		/**
		 * The Terminal structure of this room, if present, otherwise undefined.
		 */
		terminal?: Terminal.StructureTerminal | undefined;
	}

	interface Schema { terminal: typeof terminalSchema }
}

// Register `Game.market`
declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * A global object representing the in-game market. You can use this object to track resource
		 * transactions to/from your terminals, and your buy/sell orders.
		 *
		 * Learn more about the market system from [this article](https://docs.screeps.com/market.html).
		 */
		market: Market;
	}
}
hooks.register('gameInitializer', game => {
	game.market = new Market(game);
});
