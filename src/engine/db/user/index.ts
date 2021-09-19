import type { Database } from 'xxscreeps/engine/db';
import Fn from 'xxscreeps/utility/functional';

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
		({ provider, id }) => db.data.hget(providerMembersKey(provider), id)));
	if (Fn.some(providerConflicts, value => value !== null)) {
		throw new Error('Already associated');
	}

	// Make user
	const key = infoKey(userId);
	const result = await db.data.hset(key, 'username', username, { if: 'nx' });
	if (!result) {
		throw new Error('User already created');
	}
	await Promise.all<any>([
		db.data.sadd('users', [ userId ]),
		db.data.hmset(key, {
			registeredDate: Date.now(),
		}),
		db.data.hmset(userProvidersKey(userId),
			[ ...Fn.map(allProviders, ({ provider, id }): [ string, string ] => [ provider, id ]) ]),
		...Fn.map(allProviders, ({ provider, id }) =>
			db.data.hset(providerMembersKey(provider), id, userId)),
	]);
}

export function findProvidersForUser(db: Database, userId: string) {
	return db.data.hgetall(userProvidersKey(userId));
}

export async function findUserByProvider(db: Database, provider: string, providerId: string) {
	return db.data.hget(providerMembersKey(provider), providerId);
}

export async function findUserByName(db: Database, username: string) {
	return findUserByProvider(db, 'username', flattenUsername(username));
}
