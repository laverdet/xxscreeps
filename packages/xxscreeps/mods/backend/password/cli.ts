import type { Database } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { CliError } from 'xxscreeps/mods/cli/commands.js';
import { hooks } from 'xxscreeps/mods/cli/symbols.js';
import { setPassword } from './model.js';

// Minimum length mirrors /api/user/password's validator so operator-set and
// user-set passwords meet the same bar.
const MIN_PASSWORD_LENGTH = 8;

function authGroup(db: Database) {
	return {
		name: 'auth',
		description: 'Password authentication admin',
		commands: [
			{
				name: 'setPassword',
				description: `Set or reset a user's login password (min ${MIN_PASSWORD_LENGTH} chars)`,
				args: [
					{ name: 'usernameOrId', kind: 'string' as const },
					{ name: 'password', kind: 'string' as const, description: `New password (min ${MIN_PASSWORD_LENGTH} chars)` },
				],
				handler: async (usernameOrId: string, password: string) => {
					if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
						throw new CliError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
					}
					const userId = await User.findUserByName(db, usernameOrId) ?? usernameOrId;
					const info = await db.data.hgetall(User.infoKey(userId));
					if (info.username === undefined) {
						throw new CliError(`User not found: ${usernameOrId}`);
					}
					await setPassword(db, userId, password);
					return `Password set for ${info.username} (${userId})`;
				},
				example: 'auth.setPassword("alice", "hunter2!")',
			},
		],
	};
}

hooks.register('commands', db => [ authGroup(db) ]);
