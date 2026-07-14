import type { Order, OrderType } from './order.js';
import type { Transactions } from './transaction.js';
import type { GameBase } from 'xxscreeps/game/game.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents } from 'xxscreeps/game/index.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { Orders } from './order.js';

export interface CreateOrderOptions {
	type: OrderType;
	resourceType: ResourceType;
	price: number;
	totalAmount: number;
	roomName: string;
}

// Argument validation shared between the runtime method and the intent processor; `price` is in
// millicredits on both sides.
export function checkOrderParams(type: string, resourceType: string, price: number, totalAmount: number) {
	if (type !== C.ORDER_BUY && type !== C.ORDER_SELL) {
		return C.ERR_INVALID_ARGS;
	}
	// Divergence from Screeps, which accepts a negative amount and silently never creates the order.
	if (!(C.RESOURCES_ALL as string[]).includes(resourceType) || !(price > 0) || !Number.isFinite(totalAmount) || !(totalAmount > 0)) {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

export class Market {
	readonly #map;
	readonly #transactions;
	readonly #orders;
	readonly #money;
	readonly #pendingOrders = new Map<string, [ type: OrderType, resourceType: ResourceType, price: number, totalAmount: number ][]>();
	#ordersCreatedDuringTick = 0;

	constructor(game: GameBase, transactions?: Transactions, orders = new Orders(), money = 0) {
		this.#map = game.map;
		this.#transactions = transactions;
		this.#orders = orders;
		this.#money = money;
	}

	/** Your own orders (including inactive ones), indexed by id. */
	@cached get orders() {
		return Object.fromEntries(Fn.map(this.#orders.mine, order => [ order.id, order ] as const));
	}

	get credits() { return this.#money / 1000; }
	get incomingTransactions() { return this.#transactions?.incoming ?? []; }
	get outgoingTransactions() { return this.#transactions?.outgoing ?? []; }

	getAllOrders(filter?: ((order: Order) => boolean) | Partial<Order>) {
		const active = this.#orders.active;
		if (filter === undefined) {
			return [ ...active ];
		} else if (typeof filter === 'function') {
			return active.filter(filter);
		}
		const entries = Object.entries(filter);
		return active.filter(order => entries.every(([ key, value ]) => order[key as keyof Order] === value));
	}

	getOrderById(id: string) {
		// Your own orders take precedence, so an inactive order of yours (absent from the public book)
		// is still found by id.
		return this.#orders.mine.find(order => order.id === id) ??
			this.#orders.active.find(order => order.id === id) ?? null;
	}

	/**
	 * Create a market order in your terminal. Buy and sell orders charge a `MARKET_FEE` listing fee
	 * up front. `price` is in credits per unit.
	 */
	createOrder(options: CreateOrderOptions) {
		const { type, resourceType, price, roomName } = options;
		const totalAmount = Math.trunc(options.totalAmount);
		// Prices cross to millicredits here, the mirror of the ÷1000 in the read getters.
		const millicredits = Math.round(price * 1000);
		const checkParams = checkOrderParams(type, resourceType, millicredits, totalAmount);
		if (checkParams !== C.OK) {
			return checkParams;
		}
		if (price * totalAmount * C.MARKET_FEE > this.credits) {
			return C.ERR_NOT_ENOUGH_RESOURCES;
		}
		const terminal = Game.rooms[roomName]?.terminal;
		if (!terminal?.my) {
			return C.ERR_NOT_OWNER;
		}
		if (this.#orders.mine.length + this.#ordersCreatedDuringTick >= C.MARKET_MAX_ORDERS) {
			return C.ERR_FULL;
		}
		// The intent slot is unique per (object, action), so same-tick orders accumulate into a batch.
		const pending = getOrSet(this.#pendingOrders, terminal.id, () => []);
		pending.push([ type, resourceType, millicredits, totalAmount ]);
		intents.save(terminal, 'createOrder', pending);
		++this.#ordersCreatedDuringTick;
		return C.OK;
	}

	cancelOrder() {}
	changeOrderPrice() {}
	deal() {}
	extendOrder() {}
	getHistory() {}

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
