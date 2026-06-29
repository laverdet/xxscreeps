import type { Database } from 'xxscreeps/engine/db/index.js';
import type { MaybePromise } from 'xxscreeps/utility/types.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';
import { branchManifestKey, buffersKey, stringsKey } from './code.js';

// Lifecycle hooks for users. Mods register `remove` handlers to tear down their own per-user,
// db-scoped state (e.g. private messages) when a user is deleted, so `remove` below stays
// self-contained for every caller rather than each call site enumerating mod cleanups.
export const hooks = makeHookRegistration<{
	remove: (db: Database, userId: string) => MaybePromise<void>;
}>();
const removeHooks = hooks.makeMapped('remove');

const providerMembersKey = (provider: string) => `usersByProvider/${provider}`;
const userProvidersKey = (userId: string) => `user/${userId}/provider`;
export const infoKey = (userId: string) => `user/${userId}`;

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
		db.data.hmset(key, {
			registeredDate: Date.now(),
		}),
		db.data.hmset(userProvidersKey(userId),
			[ ...Fn.map(allProviders, ({ provider, id }): [ string, string ] => [ provider, id ]) ]),
		...Fn.map(allProviders, ({ provider, id }) =>
			db.data.hSet(providerMembersKey(provider), id, userId)),
	]);
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
			db.data.vdel(buffersKey(userId, branchName)),
			db.data.vdel(stringsKey(userId, branchName)),
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
