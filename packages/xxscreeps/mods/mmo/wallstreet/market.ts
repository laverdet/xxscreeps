import type { OrderType } from './order.js';
import type { GameBase } from 'xxscreeps/game/game.js';
import type { Transactions } from 'xxscreeps/mods/classic/brokerage/transaction.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';

export interface CreateOrderOptions {
	/** The order type, either `ORDER_SELL` or `ORDER_BUY`. */
	type: OrderType;

	/**
	 * Either one of the `RESOURCE_*` constants or one of account-bound resources (See
	 * `INTERSHARD_RESOURCES` constant). If your Terminal doesn't have the specified resource, the
	 * order will be temporary inactive.
	 */
	resourceType: ResourceType;

	/** The price for one resource unit in credits. Can be a decimal number. */
	price: number;

	/** The amount of resources to be traded in total. */
	totalAmount: number;

	/**
	 * The room where your order will be created. You must have your own Terminal structure in this
	 * room, otherwise the created order will be temporary inactive. This argument is not used when
	 * `resourceType` is one of account-bound resources (See `INTERSHARD_RESOURCES` constant).
	 */
	roomName?: string;
}

export class Market {
	readonly #map;
	readonly #transactions;

	constructor(game: GameBase, transactions?: Transactions) {
		this.#map = game.map;
		this.#transactions = transactions;
	}

	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	get credits() { return 0; }
	get orders() { return {}; }
	get incomingTransactions() { return this.#transactions?.incoming ?? []; }
	get outgoingTransactions() { return this.#transactions?.outgoing ?? []; }

	/**
	 * Create a market order in your terminal. You will be charged `price * amount * 0.05` credits
	 * when the order is placed. The maximum orders count is 300 per player. You can create an order
	 * at any time with any amount, it will be automatically activated and deactivated depending on
	 * the resource/credits availability.
	 */
	createOrder(options: CreateOrderOptions) {
		const { type, resourceType, totalAmount, price, roomName } = options;
		if (roomName === undefined) {
			return C.ERR_INVALID_ARGS;
		} else {
			const terminal = Game.rooms[roomName]?.terminal;
			if (terminal?.my) {
				return terminal['#createOrder'](type, resourceType, price, totalAmount);
			} else {
				return C.ERR_NOT_OWNER;
			}
		}
	}

	cancelOrder() {}
	changeOrderPrice() {}
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

// Argument validation shared between the runtime method and the intent processor; `price` is in
// millicredits on both sides.
export function checkOrderParams(type: string, resourceType: ResourceType, price: number, totalAmount: number) {
	if (
		C.RESOURCES_ALL.includes(resourceType) &&
		(type === C.ORDER_BUY || type === C.ORDER_SELL) &&
		// Divergence from Screeps, which accepts a negative amount and silently never creates the
		// order.
		price > 0 && Number.isInteger(price) &&
		totalAmount > 0 && Number.isInteger(totalAmount)
	) {
		return C.OK;
	}
	return C.ERR_INVALID_ARGS;
}
