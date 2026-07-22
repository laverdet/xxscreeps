import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { Market } from './market.js';
import { terminalShape } from './schema.js';
import { StructureTerminal } from './terminal.js';

// Export `StructureTerminal` to runtime globals
registerGlobal(StructureTerminal);

export type TerminalRoomSchema = typeof terminalSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const terminalSchema = registerVariant('Room.objects', compose(terminalShape, StructureTerminal));

// Instantiate `Game.market`
hooks.register('gameInitializer', (game, data) => {
	game.market = new Market(game, data);
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
}
