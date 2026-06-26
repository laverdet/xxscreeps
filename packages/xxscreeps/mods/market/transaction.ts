import * as Id from 'xxscreeps/engine/schema/id.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
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

export const format = declare('MarketTransaction', () => compose(shape, Transaction));

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
		return description == null ? undefined : description.replace(/</g, '&lt;');
	}
}

export const { read, write } = makeReaderAndWriter(format);

export interface Transactions {
	incoming: Transaction[];
	outgoing: Transaction[];
}

// Per-tick payload: each direction lists transaction ids newest-first, `blobs` holds the referenced
// schema blobs by id, and `usernames` resolves the parties for the read-time getters.
export interface TransactionPayload {
	incoming: string[];
	outgoing: string[];
	blobs: Record<string, Readonly<Uint8Array>>;
	usernames: Record<string, string>;
}

// Register each party so the getters resolve, then overlay each referenced blob.
export function readTransactions(payload: TransactionPayload): Transactions {
	for (const [ userId, username ] of Object.entries(payload.usernames)) {
		userInfo.set(userId, { username });
	}
	const overlay = (ids: string[]) => ids.map(id => read(payload.blobs[id]!));
	return { incoming: overlay(payload.incoming), outgoing: overlay(payload.outgoing) };
}
