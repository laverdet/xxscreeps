import { hooks } from 'xxscreeps/game/index.js';
import { Transactions } from 'xxscreeps/mods/classic/brokerage/transaction.js';
import { Market } from './market.js';
import './terminal.js';

// The runner ships transactions only when a transfer changes the list, so retain the last payload
// and reuse it on the ticks it isn't resent.
let transactions: Transactions | undefined;
hooks.register('gameInitializer', (game, data) => {
	if (data?.transactions) {
		transactions = new Transactions(data.transactions);
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
