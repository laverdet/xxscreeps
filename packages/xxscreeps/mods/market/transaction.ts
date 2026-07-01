import * as Id from 'xxscreeps/engine/schema/id.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { userInfo } from 'xxscreeps/game/index.js';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/resource.js';
import { BufferObject, compose, declare, optional, struct, withOverlay } from 'xxscreeps/schema/index.js';

const shape = struct({
	transactionId: Id.format,
	time: 'int32',
	resourceType: resourceEnumFormat,
	amount: 'int32',
	from: 'string',
	to: 'string',
	'#sender': Id.format,
	'#recipient': Id.format,
	'#description': optional('string'),
});

const format = declare('MarketTransaction', () => compose(shape, Transaction));

/**
 * One terminal transfer, exposed through `Game.market.incomingTransactions` /
 * `outgoingTransactions`. It is stored once as an immutable blob and referenced from each party's
 * list, so the runner hands both parties' runtimes the same buffer. The parties are kept as user ids
 * and resolved to usernames at read time; the description is kept raw and HTML-escaped by its getter.
 */
export class Transaction extends withOverlay(BufferObject, shape) {
	@enumerable get sender() { return userInfo.get(this['#sender']); }
	@enumerable get recipient() { return userInfo.get(this['#recipient']); }
	@enumerable get description() {
		const description = this['#description'];
		return description == null ? undefined : description.replaceAll('<', '&lt;');
	}
}

export const { read, write } = makeReaderAndWriter(format);

export class Transactions {
	readonly payload;

	constructor(payload: TransactionPayload) {
		this.payload = payload;
	}

	@cached get incoming(): Transaction[] {
		return this.overlay(this.payload.incoming);
	}

	@cached get outgoing(): Transaction[] {
		return this.overlay(this.payload.outgoing);
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

// Per-tick payload: each direction lists transaction ids newest-first and `blobs` holds the
// referenced schema blobs by id. The parties resolve through `userInfo`, which the runner populates
// from the ids the connector contributes to `payload.userIds`.
export interface TransactionPayload {
	incoming: string[];
	outgoing: string[];
	blobs: Record<string, Readonly<Uint8Array>>;
}
