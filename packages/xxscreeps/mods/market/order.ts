import type * as C from 'xxscreeps/game/constants/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { BufferObject, compose, declare, withOverlay } from 'xxscreeps/schema/index.js';
import { orderShape } from './schema.js';

export type OrderType = typeof C.ORDER_BUY | typeof C.ORDER_SELL;

export const format = declare('MarketOrder', () => compose(orderShape, Order));

/**
 * One buy/sell order, exposed through `Game.market`. It is stored once as a mutable blob and
 * referenced by id from the active book, the owner's list, and the owning terminal, so the runner
 * hands every player's runtime the same buffer for the (player-identical) active book. Prices are
 * stored in millicredits and divided to credits by the `price` getter; the owner is kept as a
 * hidden user id so readers never see it.
 */
export class Order extends withOverlay(BufferObject, orderShape) {
	@enumerable get price() { return this['#price'] / 1000; }
}

// Building a reader resolves the format, which closes its extension paths (`resourceEnumFormat`) —
// and this module evaluates inside the runtime graph, where another mod's schema registration may
// not have run yet. So the runtime reader is built on first use; the server side (`model.ts`)
// builds eagerly behind the fully-loaded game module graph instead.
const read = function() {
	let read: ReturnType<typeof makeReaderAndWriter<typeof format>>['read'] | undefined;
	return (buffer: Readonly<Uint8Array>) => (read ??= makeReaderAndWriter(format).read)(buffer);
}();

export class Orders {
	readonly #active;
	readonly #mine;
	readonly #blobs: Record<string, Readonly<Uint8Array>>;

	constructor(payload?: OrderPayload, previous?: Orders) {
		this.#active = payload?.active ?? [];
		this.#mine = payload?.mine ?? [];
		// Blobs arrive as deltas: the connector ships only the orders that changed since the last
		// tick, so unchanged ids fall back to the previous tick's buffer. An id whose blob is absent
		// from both (removed between the id-set read and the fetch) is dropped by the overlay.
		const retained = previous === undefined ? {} : previous.#blobs;
		const blobs = payload?.blobs ?? {};
		const memberIds = new Set([ ...this.#active, ...this.#mine ]);
		this.#blobs = Fn.fromEntries(function*() {
			for (const id of memberIds) {
				const blob = blobs[id] ?? retained[id];
				if (blob !== undefined) {
					yield [ id, blob ] as const;
				}
			}
		}());
	}

	@cached get active(): Order[] {
		return this.overlay(this.#active);
	}

	@cached get mine(): Order[] {
		return this.overlay(this.#mine);
	}

	private overlay(ids: string[]) {
		return Fn.pipe(
			ids,
			$$ => Fn.map($$, id => this.#blobs[id]),
			$$ => Fn.filter($$),
			$$ => Fn.map($$, read),
			$$ => [ ...$$ ]);
	}
}

// Per-tick payload: `active` lists the public book's order ids, `mine` this user's order ids (active
// and inactive), and `blobs` holds the schema blobs that changed since the runtime's last tick. The
// active book is identical for every player, so its blobs are shared across runtimes.
export interface OrderPayload {
	active: string[];
	mine: string[];
	blobs: Record<string, Readonly<Uint8Array>>;
}
