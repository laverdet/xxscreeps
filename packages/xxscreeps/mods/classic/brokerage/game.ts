import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { Transactions } from 'xxscreeps/mods/classic/brokerage/transaction.js';
import { compose } from 'xxscreeps/schema/index.js';
import { Market } from './market.js';
import { terminalShape } from './schema.js';
import { StructureTerminal } from './terminal.js';

// Export `StructureTerminal` to runtime globals
registerGlobal(StructureTerminal);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const terminalSchema = registerVariant('Room.objects', compose(terminalShape, StructureTerminal));

// The runner ships transactions only when a transfer changes the list, so retain the last payload
// and reuse it on the ticks it isn't resent.
let transactions: Transactions | undefined;
hooks.register('gameInitializer', (game, data) => {
	if (data?.transactions) {
		transactions = new Transactions(data.transactions, transactions);
	}
	game.market = new Market(game, transactions);
});

// ---

declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * A global object representing the in-game market. You can use this object to track resource
		 * transactions to/from your terminals, and your buy/sell orders.
		 *
		 * Learn more about the market system from [this article](https://docs.screeps.com/market.html).
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market
		 */
		market: Market;
	}
}

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
