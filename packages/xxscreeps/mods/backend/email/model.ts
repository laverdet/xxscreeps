import type { Database } from 'xxscreeps/engine/db/index.js';
import { associateProvider, emailForUser, emailProvider, flattenEmail, infoKey } from 'xxscreeps/engine/db/user/index.js';

// Field on the user info hash holding an address awaiting confirmation. Distinct from the `email`
// provider, which only ever holds a *confirmed* address.
const pendingEmailField = 'pendingEmail';

/**
 * Establish `email` for a user, either confirming it outright or — with `holdPending` — parking it
 * until they prove the inbox is theirs. Returns whether the address was left pending; throws when
 * it is confirmed to somebody else already.
 *
 * Whether to hold an address is the caller's decision, not this layer's: a backend which can mail a
 * confirmation link holds them, and the CLI, which cannot, does not. Pending addresses are
 * deliberately not indexed for uniqueness, so two accounts may await the same one; whoever confirms
 * first keeps it (see `verifyPendingEmail`).
 */
export async function setEmail(db: Database, userId: string, rawEmail: string, holdPending: boolean) {
	const email = flattenEmail(rawEmail);
	if (holdPending) {
		await db.data.hSet(infoKey(userId), pendingEmailField, email);
		return { pending: true };
	}
	if (!await associateProvider(db, userId, emailProvider, email)) {
		throw new Error('Already associated');
	}
	await db.data.hDel(infoKey(userId), [ pendingEmailField ]);
	return { pending: false };
}

/** The address a user is currently waiting to confirm, or `null`. */
export function pendingEmailForUser(db: Database, userId: string) {
	return db.data.hGet(infoKey(userId), pendingEmailField);
}

/**
 * Confirm a user's pending address, promoting it to their `email` provider. `email` must match the
 * currently-pending address, so a link minted for an address the user has since replaced reports
 * `stale` and changes nothing. An address another account confirmed in the meantime reports `taken`.
 *
 * Confirming an address the user has *already* confirmed reports `confirmed` without writing, so
 * opening a still-valid confirmation link a second time is idempotent rather than an error.
 */
export async function verifyPendingEmail(db: Database, userId: string, rawEmail: string) {
	const email = flattenEmail(rawEmail);
	const pending = await pendingEmailForUser(db, userId);
	if (pending !== email) {
		const confirmed = await emailForUser(db, userId);
		return confirmed === email ? 'confirmed' : 'stale';
	}
	// A different account may have confirmed the same address while this one was pending.
	if (!await associateProvider(db, userId, emailProvider, email)) {
		return 'taken';
	}
	await db.data.hDel(infoKey(userId), [ pendingEmailField ]);
	return 'confirmed';
}
