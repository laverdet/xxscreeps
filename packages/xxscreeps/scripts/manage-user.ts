// User operations for the `manage` CLI. Split out of `manage.ts`, which is a top-level script (it
// connects to storage at import and parses `process.argv`), so these can be imported and unit-tested
// with an injected database. `manage.ts` keeps only the argv plumbing around them.

import type { Database } from 'xxscreeps/engine/db/index.js';
import * as Code from 'xxscreeps/engine/db/user/code.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

// Which account state each removal verb targets. The original defect was that `bot remove` ran the
// account-deleting handler; keeping the mapping as data lets a test pin it without importing the
// script.
export const removalCommands = {
	'user remove': 'account',
	'bot remove': 'code',
} as const;

// Accepts either a raw user id or a username.
export async function resolveUserId(db: Database, who: string) {
	if (await db.data.sIsMember('users', who)) {
		return who;
	}
	const byName = await User.findUserByName(db, who);
	if (byName !== null) {
		return byName;
	}
	throw new Error(`No such user: ${who}`);
}

/**
 * Delete an account: its per-shard state (through `removeShardState`) and its shared record,
 * including its code. Room objects the user owned are left behind.
 */
export async function removeUser(
	db: Database,
	who: string,
	removeShardState: (userId: string) => Promise<void>,
) {
	const id = await resolveUserId(db, who);
	await removeShardState(id);
	await User.remove(db, id);
	return id;
}

/** Delete only a bot's code, leaving the account, its providers, and its room objects intact. */
export async function removeBotCode(db: Database, who: string) {
	const id = await resolveUserId(db, who);
	await Code.removeCode(db, id);
	return id;
}
