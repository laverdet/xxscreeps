import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { BufferObject, compose, declare, withOverlay } from 'xxscreeps/schema/index.js';
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
	@enumerable get active() { return this.amount > 0; }
	@enumerable get price() { return this['#price'] / 1000; }
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
