import type { Order, OrderType } from './order.js';
import type { StructureTerminal } from 'xxscreeps/mods/classic/brokerage/terminal.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { Iteratee } from 'xxscreeps/utility/lodash.js';
import { Game } from 'xxscreeps/game/index.js';
import { Market } from 'xxscreeps/mods/classic/brokerage/market.js';
import { filter } from 'xxscreeps/utility/lodash.js';
import { extend } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { Orders } from './order.js';

/**
 * An object describing the order to create, accepted by `Game.market.createOrder`.
 * @public
 * @see https://docs.screeps.com/api/#Game.market.createOrder
 */
export interface CreateOrderOptions {
	/**
	 * The order type, either `ORDER_SELL` or `ORDER_BUY`.
	 * @public
	 */
	type: OrderType;

	/**
	 * Either one of the `RESOURCE_*` constants or one of account-bound resources (See
	 * `INTERSHARD_RESOURCES` constant). If your Terminal doesn't have the specified resource, the
	 * order will be temporary inactive.
	 * @public
	 */
	resourceType: ResourceType;

	/**
	 * The price for one resource unit in credits. Can be a decimal number.
	 * @public
	 */
	price: number;

	/**
	 * The amount of resources to be traded in total.
	 * @public
	 */
	totalAmount: number;

	/**
	 * The room where your order will be created. You must have your own Terminal structure in this
	 * room, otherwise the created order will be temporary inactive. This argument is not used when
	 * `resourceType` is one of account-bound resources (See `INTERSHARD_RESOURCES` constant).
	 * @public
	 */
	roomName?: string;
}

declare module 'xxscreeps/mods/classic/brokerage/market.js' {
	interface Market {
		'#orders': Orders;

		/**
		 * Your current credits balance.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market.credits
		 */
		credits: number;

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
		createOrder: (options: CreateOrderOptions) => ReturnType<StructureTerminal['#createOrder']>;

		/**
		 * Cancel a previously created order. The 5% fee is not returned.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market.cancelOrder
		 */
		cancelOrder: () => undefined;

		/**
		 * Change the price of an existing order. If `newPrice` is greater than old price, you will be
		 * charged `(newPrice - oldPrice) * remainingAmount * 0.05` credits.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market.changeOrderPrice
		 */
		changeOrderPrice: () => undefined;

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
		deal: () => undefined;

		/**
		 * Add more capacity to an existing order. It will affect `remainingAmount` and `totalAmount`
		 * properties. You will be charged `price * addAmount * 0.05` credits.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market.extendOrder
		 */
		extendOrder: () => undefined;

		/**
		 * Get other players' orders currently active on the market. This method supports internal
		 * indexing by `resourceType`.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market.getAllOrders
		 */
		getAllOrders: (predicate?: Iteratee<Order> | null) => Order[];

		/**
		 * Get daily price history of the specified resource on the market for the last 14 days.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market.getHistory
		 */
		getHistory: () => undefined;

		/**
		 * Retrieve info for specific market order.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market.getOrderById
		 */
		getOrderById: (id: string) => Order | null;

		/**
		 * An object with your active and inactive buy/sell orders on the market. See
		 * [`getAllOrders`](https://docs.screeps.com/api/#Game.market.getAllOrders) for properties
		 * explanation.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.market.orders
		 */
		get orders(): Record<string, Order>;
	}
}

extend(Market, {
	orders: {
		get() { return this['#orders'].mine; },
	},

	createOrder(options: CreateOrderOptions) {
		const { type, resourceType, totalAmount, price, roomName } = options;
		const result = (() => {
			if (roomName === undefined) {
				return C.ERR_INVALID_ARGS;
			} else {
				const terminal = Game.rooms[roomName]?.terminal;
				if (terminal?.my) {
					return terminal['#createOrder'](this, type, resourceType, price, totalAmount);
				} else {
					return C.ERR_NOT_OWNER;
				}
			}
		})();
		if (result === C.OK) {
			++outstandingOrders;
		}
		return result;
	},

	getAllOrders(predicate) {
		return filter(this['#orders'].active, predicate);
	},

	getOrderById(id) {
		return this['#orders'].get(id) ?? null;
	},

	cancelOrder() {},
	changeOrderPrice() {},
	deal() {},
	extendOrder() {},
	getHistory() {},

});

// Hook market initializer to add order book
let outstandingOrders = 0;
let previousOrders: Orders | undefined;
Market.prototype['#initialize'] = function(initialize) {
	return function(this: Market, payload) {
		initialize.call(this, payload);
		outstandingOrders = payload?.marketBook?.mine.length ?? 0;
		this.credits = (payload?.credits ?? 0) / 1000;
		previousOrders =
			this['#orders'] =
				new Orders(payload, previousOrders);
	};
}(Market.prototype['#initialize']);

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

export function checkOrderFee(credits: number, amount: number, price: number) {
	return price * amount * C.MARKET_FEE <= credits
		? C.OK
		: C.ERR_NOT_ENOUGH_RESOURCES;
}

export function checkOrderLimit() {
	return outstandingOrders < C.MARKET_MAX_ORDERS
		? C.OK
		: C.ERR_FULL;
}
