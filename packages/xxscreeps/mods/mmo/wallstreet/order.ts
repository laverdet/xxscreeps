import type { TickPayload } from 'xxscreeps/engine/runner/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { BufferObject, compose, declare, withOverlay } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { orderShape } from './schema.js';

export type OrderType = typeof C.ORDER_BUY | typeof C.ORDER_SELL;

/**
 * One buy/sell order, exposed through `Game.market`. It is stored once as a mutable blob and
 * referenced by id from the active book, the owner's list, and the owning terminal, so the runner
 * hands every player's runtime the same buffer for the (player-identical) active book. Prices are
 * stored in millicredits and divided to credits by the `price` getter; the owner is kept as a
 * hidden user id so readers never see it.
 */
export class Order extends withOverlay(BufferObject, orderShape) {
	/**
	 * Whether the order is currently active. An order is automatically activated and deactivated
	 * depending on the resource/credits availability.
	 * @public
	 */
	@enumerable get active() {
		return this.amount > 0;
	}

	/**
	 * The current price per unit.
	 * @public
	 */
	@enumerable get price() { return this['#price'] / 1000; }

	/**
	 * Either `ORDER_SELL` or `ORDER_BUY`.
	 * @public
	 */
	@enumerable get type() { return this['#buy'] ? C.ORDER_BUY : C.ORDER_SELL; }
}

// Initialize format bound to `Order`
const format = declare('MarketOrder', compose(orderShape, Order));
const {
	offsetOf: orderOffsetOf,
	read: readOrder,
	version: orderSchemaVersion,
	upgrade: upgradeOrder,
	write: writeOrder,
} = makeReaderAndWriter(format);

const orderAmountOffsetOf = orderOffsetOf('MarketOrder', 'amount');
export { orderAmountOffsetOf, readOrder, orderSchemaVersion, upgradeOrder, writeOrder };

// Internal `Game.market` helper
export class Orders {
	readonly #active;
	readonly #mine;
	readonly #blobs: Map<string, Readonly<Uint8Array>> | undefined;

	constructor(payload?: TickPayload, previous?: Orders) {
		const marketBook = payload?.marketBook;
		if (marketBook) {
			const { active, mine } = marketBook;
			this.#active = active;
			this.#mine = mine;
			const ids = new Set(Fn.concat([ active, mine ]));
			const previousBlobs = Fn.pipe(
				(previous && previous.#blobs)?.entries() ?? [],
				$$ => Fn.filter($$, ([ id ]) => ids.has(id)),
			);
			this.#blobs = new Map(Fn.concat([ previousBlobs, marketBook.blobs ]));
		}
	}

	@cached get active(): Order[] {
		return Fn.pipe(
			this.#active ?? [],
			$$ => Fn.map($$, id => this.#blobs?.get(id)),
			$$ => Fn.filter($$),
			$$ => Fn.map($$, readOrder),
			$$ => [ ...$$ ]);
	}

	@cached get mine(): Record<string, Order> {
		return Fn.pipe(
			this.#mine ?? [],
			$$ => Fn.map($$, id => {
				const blob = this.#blobs?.get(id);
				if (blob) {
					return [ id, readOrder(blob) ] as const;
				}
			}),
			$$ => Fn.filter($$),
			$$ => Fn.fromEntries($$));
	}

	get(id: string) {
		const blob = this.#blobs?.get(id);
		if (blob) {
			return readOrder(blob);
		}
	}
}

export interface OrderPayload {
	// Active market book orders
	active: string[];
	// Player's order ids (active & inactive)
	mine: string[];
	// Unseen market blobs
	blobs: (readonly [ string, Readonly<Uint8Array> ])[];
}
