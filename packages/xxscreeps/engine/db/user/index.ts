import type { Badge } from './badge.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import type { MaybePromise } from 'xxscreeps/utility/types.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';
import { branchManifestKey, buffersKey, saveContent, stringsKey } from './code.js';

// Lifecycle hooks for users. Mods register `remove` handlers to tear down their own per-user,
// db-scoped state (e.g. private messages, stats) when a user is deleted, so `remove` below stays
// self-contained for every caller rather than each call site enumerating mod cleanups.
export const hooks = makeHookRegistration<{
	remove: (db: Database, userId: string) => MaybePromise<void>;
}>();
const removeHooks = hooks.makeMapped('remove');

const providerMembersKey = (provider: string) => `usersByProvider/${provider}`;
const userProvidersKey = (userId: string) => `user/${userId}/provider`;
export const infoKey = (userId: string) => `user/${userId}`;

// Field on the user info hash holding an address awaiting confirmation. Distinct from the `email`
// provider, which only ever holds a *confirmed* address.
const pendingEmailField = 'pendingEmail';

interface BackendUserInfo {
	username: string;
	badge: Badge | null;
}

const annoyingUsernames = [
	NaN, Infinity, false, true, undefined, null,
].map(value => `${value}`);
export function checkUsername(username: string) {
	return (
		typeof username === 'string' &&
		username.length <= 20 &&
		!annoyingUsernames.includes(username) &&
		/^[a-zA-Z0-9][a-zA-Z0-9_-]+[a-zA-Z0-9]$/.test(username)
	);
}

function flattenUsername(username: string) {
	return username.replace(/[-_ ]/g, '').toLowerCase();
}

export async function create(db: Database, userId: string, username: string, providers: { provider: string; id: string }[] = []) {
	// TODO: multi / exec

	// Check for existing associations
	const allProviders = [
		{ provider: 'username', id: flattenUsername(username) },
		...providers,
	];
	const providerConflicts = await Promise.all(Fn.map(allProviders,
		({ provider, id }) => db.data.hGet(providerMembersKey(provider), id)));
	if (Fn.some(providerConflicts, value => value !== null)) {
		throw new Error('Already associated');
	}

	// Make user
	const key = infoKey(userId);
	const result = await db.data.hSet(key, 'username', username, { if: 'NX' });
	if (!result) {
		throw new Error('User already created');
	}
	await Promise.all<any>([
		db.data.sAdd('users', [ userId ]),
		db.data.hmSet(key, {
			registeredDate: Date.now(),
		}),
		db.data.hmSet(userProvidersKey(userId),
			[ ...Fn.map(allProviders, ({ provider, id }): [ string, string ] => [ provider, id ]) ]),
		...Fn.map(allProviders, ({ provider, id }) =>
			db.data.hSet(providerMembersKey(provider), id, userId)),
	]);

	await saveContent(db, userId, 'main', new Map([ [ 'main', 'module.exports.loop = function () {};' ] ]));
}

/**
 * Associate `email` as the user's confirmed `email` provider, replacing any address they had before.
 * The reverse lookup is claimed with `NX` so two accounts racing to confirm the same address cannot
 * both win it; returns `false` without writing when somebody else holds it.
 */
async function associateEmail(db: Database, userId: string, email: string) {
	const [ claimed, previous ] = await Promise.all([
		db.data.hSet(providerMembersKey('email'), email, userId, { if: 'NX' }),
		db.data.hGet(userProvidersKey(userId), 'email'),
	]);
	if (!claimed) {
		// Somebody holds it — us, if this is a repeat confirmation, and otherwise not ours to take.
		const holder = await db.data.hGet(providerMembersKey('email'), email);
		if (holder !== userId) {
			return false;
		}
	}
	await Promise.all([
		db.data.hSet(userProvidersKey(userId), 'email', email),
		// Free the reverse lookup for a replaced address so it can be reused.
		...previous !== null && previous !== email ? [ db.data.hDel(providerMembersKey('email'), [ previous ]) ] : [],
	]);
	return true;
}

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
export async function setEmail(db: Database, userId: string, email: string, holdPending: boolean) {
	if (holdPending) {
		await db.data.hSet(infoKey(userId), pendingEmailField, email);
		return { pending: true };
	}
	if (!await associateEmail(db, userId, email)) {
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
 * currently-pending address (guards against a stale/superseded link). Returns `false` when it
 * doesn't match, or when the address was meanwhile confirmed by another account.
 *
 * Confirming an address the user has *already* confirmed succeeds without writing, so opening a
 * still-valid confirmation link a second time is idempotent rather than an error.
 */
export async function verifyPendingEmail(db: Database, userId: string, email: string) {
	const pending = await db.data.hGet(infoKey(userId), pendingEmailField);
	if (pending !== email) {
		const confirmed = await providerIdForUser(db, 'email', userId);
		return confirmed === email;
	}
	// A different account may have confirmed the same address while this one was pending.
	if (!await associateEmail(db, userId, email)) {
		return false;
	}
	await db.data.hDel(infoKey(userId), [ pendingEmailField ]);
	return true;
}

/**
 * Deletes a user's database records: lookup entries, info, and code. Room objects owned by the
 * user are unaffected.
 */
export async function remove(db: Database, userId: string) {
	const [ providers, branches ] = await Promise.all([
		findProvidersForUser(db, userId),
		db.data.sMembers(branchManifestKey(userId)),
	]);
	await Promise.all([
		db.data.sRem('users', [ userId ]),
		db.data.del(infoKey(userId)),
		db.data.del(userProvidersKey(userId)),
		db.data.del(branchManifestKey(userId)),
		...Fn.map(Object.entries(providers), ([ provider, providerId ]) =>
			db.data.hDel(providerMembersKey(provider), [ providerId ])),
		...Fn.transform(branches, branchName => [
			db.data.vDel(buffersKey(userId, branchName)),
			db.data.vDel(stringsKey(userId, branchName)),
		]),
		...removeHooks(db, userId),
	]);
}

export function findProvidersForUser(db: Database, userId: string) {
	return db.data.hGetAll(userProvidersKey(userId));
}

export function providerIdForUser(db: Database, provider: string, userId: string) {
	return db.data.hGet(userProvidersKey(userId), provider);
}

export async function findUserByProvider(db: Database, provider: string, providerId: string) {
	return db.data.hGet(providerMembersKey(provider), providerId);
}

export async function findUserByName(db: Database, username: string) {
	return findUserByProvider(db, 'username', flattenUsername(username));
}

export async function loadBackendUserInfo(db: Database, userId: string): Promise<BackendUserInfo | undefined> {
	const info = await db.data.hmGet(infoKey(userId), [ 'badge', 'username' ]);
	if (info.username != null) {
		return {
			username: info.username,
			badge: info.badge == null ? null : JSON.parse(info.badge) as Badge,
		};
	}
}
