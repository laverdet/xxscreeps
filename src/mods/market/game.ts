import * as Terminal from './terminal';
import { registerVariant } from 'xxscreeps/engine/schema';
import { hooks, registerGlobal } from 'xxscreeps/game';
import { Market } from './market';

// Export `StructureTerminal` to runtime globals
registerGlobal(Terminal.StructureTerminal);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureTerminal: typeof Terminal.StructureTerminal }
}

// Register schema
const terminalSchema = registerVariant('Room.objects', Terminal.format);
declare module 'xxscreeps/game/room' {
	interface Room {
		/**
		 * The Terminal structure of this room, if present, otherwise undefined.
		 */
		terminal?: Terminal.StructureTerminal | undefined;
	}

	interface Schema { terminal: typeof terminalSchema }
}

// Register `Game.market`
declare module 'xxscreeps/game/game' {
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
