import type { OrderType } from './order.js';
import type { GameBase } from 'xxscreeps/game/game.js';
import type { Transactions } from 'xxscreeps/mods/classic/brokerage/transaction.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';

/**
 * An object describing the order to create, accepted by `Game.market.createOrder`.
 * @public
 * @see https://docs.screeps.com/api/#Game.market.createOrder
 */
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

/**
 * A global object representing the in-game market. You can use this object to track resource
 * transactions to/from your terminals, and your buy/sell orders.
 *
 * Learn more about the market system from [this article](https://docs.screeps.com/market.html).
 * @public
 * @see https://docs.screeps.com/api/#Game-market
 */
export class Market {
	readonly #map;
	readonly #transactions;

	constructor(game: GameBase, transactions?: Transactions) {
		this.#map = game.map;
		this.#transactions = transactions;
	}

	/**
	 * Your current credits balance.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.credits
	 */
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	get credits() { return 0; }

	/**
	 * An object with your active and inactive buy/sell orders on the market. See
	 * [`getAllOrders`](https://docs.screeps.com/api/#Game.market.getAllOrders) for properties
	 * explanation.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.orders
	 */
	get orders() { return {}; }

	/**
	 * An array of the last 100 incoming transactions to your terminals.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.incomingTransactions
	 */
	get incomingTransactions() { return this.#transactions?.incoming ?? []; }

	/**
	 * An array of the last 100 outgoing transactions from your terminals.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.outgoingTransactions
	 */
	get outgoingTransactions() { return this.#transactions?.outgoing ?? []; }

	/**
	 * Create a market order in your terminal. You will be charged `price * amount * 0.05` credits
	 * when the order is placed. The maximum orders count is 300 per player. You can create an order
	 * at any time with any amount, it will be automatically activated and deactivated depending on
	 * the resource/credits availability.
	 * @param options An object describing the order. See `CreateOrderOptions`.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NOT_ENOUGH_RESOURCES`,
	 * `ERR_FULL`, `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.createOrder
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

	/**
	 * Cancel a previously created order. The 5% fee is not returned.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.cancelOrder
	 */
	cancelOrder() {}

	/**
	 * Change the price of an existing order. If `newPrice` is greater than old price, you will be
	 * charged `(newPrice - oldPrice) * remainingAmount * 0.05` credits.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.changeOrderPrice
	 */
	changeOrderPrice() {}

	/**
	 * Execute a trade deal from your Terminal in `yourRoomName` to another player's Terminal using
	 * the specified buy/sell order. Your Terminal will be charged energy units of transfer cost
	 * regardless of the order resource type. You can use
	 * [`Game.market.calcTransactionCost`](https://docs.screeps.com/api/#Game.market.calcTransactionCost)
	 * method to estimate it. When multiple players try to execute the same deal, the one with the
	 * shortest distance takes precedence. You cannot execute more than 10 deals during one tick.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.deal
	 */
	deal() {}

	/**
	 * Add more capacity to an existing order. It will affect `remainingAmount` and `totalAmount`
	 * properties. You will be charged `price * addAmount * 0.05` credits.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.extendOrder
	 */
	extendOrder() {}

	/**
	 * Get other players' orders currently active on the market. This method supports internal
	 * indexing by `resourceType`.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.getAllOrders
	 */
	getAllOrders() { return []; }

	/**
	 * Get daily price history of the specified resource on the market for the last 14 days.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.getHistory
	 */
	getHistory() {}

	/**
	 * Retrieve info for specific market order.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.getOrderById
	 */
	getOrderById() {}

	/**
	 * Estimate the energy transaction cost of
	 * [`StructureTerminal.send`](https://docs.screeps.com/api/#StructureTerminal.send) and
	 * [`Game.market.deal`](https://docs.screeps.com/api/#Game.market.deal) methods. The formula
	 * follows:
	 * ```
	 * Math.ceil( amount * ( 1 - Math.exp(-distanceBetweenRooms/30) ) )
	 * ```
	 * @param amount Amount of resources to be sent.
	 * @param roomName1 The name of the first room.
	 * @param roomName2 The name of the second room.
	 * @returns The amount of energy required to perform the transaction.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.market.calcTransactionCost
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
