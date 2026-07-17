import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { userInfo } from 'xxscreeps/game/index.js';
import { BufferObject, compose, declare, withOverlay } from 'xxscreeps/schema/index.js';
import { transactionShape } from './schema.js';

/**
 * One terminal transfer, exposed through `Game.market.incomingTransactions` /
 * `outgoingTransactions`. It is stored once as an immutable blob and referenced from each party's
 * list, so the runner hands both parties' runtimes the same buffer. The parties are kept as user ids
 * and resolved to usernames at read time; the description is kept raw and HTML-escaped by its getter.
 */
export class Transaction extends withOverlay(BufferObject, transactionShape) {
	@enumerable get sender() { return userInfo.get(this['#sender']); }
	@enumerable get recipient() { return userInfo.get(this['#recipient']); }
	@enumerable get description() {
		const description = this['#description'];
		return description == null ? undefined : description.replaceAll('<', '&lt;');
	}
}

const format = declare('MarketTransaction', () => compose(transactionShape, Transaction));
export const { read, write, upgrade } = makeReaderAndWriter(format);

export class Transactions {
	readonly incomingIds: string[] | undefined;
	readonly outgoingIds: string[] | undefined;
	readonly blobs: Map<string, Readonly<Uint8Array>> | undefined;

	constructor(payload: TransactionPayload | undefined, previous: Transactions | undefined) {
		if (payload) {
			const { incomingIds, outgoingIds } = payload;
			this.incomingIds = incomingIds;
			this.outgoingIds = outgoingIds;
			const ids = new Set(Fn.concat([ incomingIds, outgoingIds ]));
			const previousBlobs = Fn.pipe(
				previous?.blobs?.entries() ?? [],
				$$ => Fn.filter($$, ([ id ]) => ids.has(id)),
			);
			this.blobs = new Map(Fn.concat([ previousBlobs, payload.blobs ]));
		} else {
			// Quiet tick case, reuse previous transactions and blobs
			this.incomingIds = previous?.incomingIds;
			this.outgoingIds = previous?.outgoingIds;
			this.blobs = previous?.blobs;
		}
	}

	@cached get incoming(): Transaction[] {
		return this.overlay(this.incomingIds ?? []);
	}

	@cached get outgoing(): Transaction[] {
		return this.overlay(this.outgoingIds ?? []);
	}

	private overlay(ids: string[]) {
		return Fn.pipe(
			ids,
			$$ => Fn.map($$, id => this.blobs?.get(id)),
			$$ => Fn.filter($$),
			$$ => Fn.map($$, read),
			$$ => [ ...$$ ]);
	}
}

// Per-tick payload: each direction lists transaction ids newest-first and `blobs` holds the
// referenced schema blobs by id. The parties resolve through `userInfo`, which the runner populates
// from the ids the connector contributes to `payload.userIds`.
export interface TransactionPayload {
	incomingIds: string[];
	outgoingIds: string[];
	blobs: (readonly [ string, Readonly<Uint8Array> ])[];
}
