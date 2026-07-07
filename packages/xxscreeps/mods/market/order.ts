import * as Id from 'xxscreeps/engine/schema/id.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/schema.js';
import { BufferObject, compose, declare, struct, withOverlay } from 'xxscreeps/schema/index.js';

const shape = struct({
	id: Id.format,
	type: 'string',
	resourceType: resourceEnumFormat,
	totalAmount: 'int32',
	remainingAmount: 'int32',
	amount: 'int32',
	roomName: 'string',
	created: 'int32',
	createdTimestamp: 'double',
	active: 'bool',
	'#price': 'double',
	'#user': Id.format,
});

export const format = declare('MarketOrder', () => compose(shape, Order));

/**
 * One buy/sell order, exposed through `Game.market`. It is stored once as a mutable blob and
 * referenced by id from the active book and the owner's list, so the runner hands every player's
 * runtime the same buffer for the (player-identical) active book. Prices are stored in millicredits
 * and divided to credits by the `price` getter; the owner is kept as a hidden user id so readers
 * never see it.
 */
export class Order extends withOverlay(BufferObject, shape) {
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
	readonly payload;

	constructor(payload: OrderPayload) {
		this.payload = payload;
	}

	@cached get active(): Order[] {
		return this.overlay(this.payload.active);
	}

	@cached get mine(): Order[] {
		return this.overlay(this.payload.mine);
	}

	private overlay(ids: string[]) {
		return Fn.pipe(
			ids,
			$$ => Fn.map($$, id => this.payload.blobs[id]),
			$$ => Fn.filter($$),
			$$ => Fn.map($$, read),
			$$ => [ ...$$ ]);
	}
}

// Per-tick payload: `active` lists the public book's order ids, `mine` this user's order ids (active
// and inactive), and `blobs` holds the referenced schema blobs by id. The active book is identical
// for every player, so its blobs are shared across runtimes.
export interface OrderPayload {
	active: string[];
	mine: string[];
	blobs: Record<string, Readonly<Uint8Array>>;
}
