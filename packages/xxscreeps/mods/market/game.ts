import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { Market } from './market.js';
import { Orders } from './order.js';
import { terminalShape } from './schema.js';
import { StructureTerminal } from './terminal.js';
import { Transactions } from './transaction.js';

// Export `StructureTerminal` to runtime globals
registerGlobal(StructureTerminal);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureTerminal: typeof StructureTerminal }
}

// The runner ships transactions only when a transfer changes the list, and order blobs only when
// they change, so retain the last tick's state and fold each delta into it.
let transactions: Transactions | undefined;
let orders: Orders | undefined;
hooks.register('gameInitializer', (game, data) => {
	if (data?.transactions) {
		transactions = new Transactions(data.transactions);
	}
	orders = new Orders(data?.orders, orders);
	game.market = new Market(game, transactions, orders, data?.money);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const terminalSchema = registerVariant('Room.objects', compose(terminalShape, StructureTerminal));

// ---

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

declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		/**
		 * The Terminal structure of this room, if present, otherwise undefined.
		 */
		terminal?: StructureTerminal | undefined;
	}

	interface RoomSchema { terminal: typeof terminalSchema }
}
