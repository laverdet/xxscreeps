import type { Transactions } from './transaction.js';
import type { GameBase } from 'xxscreeps/game/game.js';

export class Market {
	orders = [];
	readonly #map;
	readonly #transactions;

	constructor(game: GameBase, transactions?: Transactions) {
		this.#map = game.map;
		this.#transactions = transactions;
	}

	get credits() { return 0; }
	get incomingTransactions() { return this.#transactions?.incoming ?? []; }
	get outgoingTransactions() { return this.#transactions?.outgoing ?? []; }
	cancelOrder() {}
	changeOrderPrice() {}
	createOrder() {}
	deal() {}
	extendOrder() {}
	getAllOrders() { return []; }
	getHistory() {}
	getOrderById() {}

	/**
	 * Estimate the energy transaction cost of `StructureTerminal.send` and `Game.market.deal`
	 * methods. The formula follows:
	 * ```
	 * Math.ceil( amount * ( 1 - Math.exp(-distanceBetweenRooms/30) ) )
	 * ```
	 * @param amount Amount of resources to be sent.
	 * @param roomName1 The name of the first room.
	 * @param roomName2 The name of the second room.
	 * @returns The amount of energy required to perform the transaction.
	 */
	calcTransactionCost(amount: number, roomName1: string, roomName2: string) {
		const distance = this.#map.getRoomLinearDistance(roomName1, roomName2, true);
		return Math.ceil(amount * (1 - Math.exp(-distance / 30)));
	}
}
