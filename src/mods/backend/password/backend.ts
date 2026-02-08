import type { Database } from 'xxscreeps/engine/db/index.js';
import crypto from 'crypto';
import { promisify } from 'util';
import { hooks } from 'xxscreeps/backend/index.js';
import config from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { findUserByName, infoKey } from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';

const { allowEmailRegistration } = config.backend;

async function checkPassword(db: Database, userId: string, password: string) {
	const info = await async function() {
		const payload = await db.data.hget(infoKey(userId), 'password');
		try {
			return JSON.parse(payload!);
		} catch (err) {}
	}();
	if (info) {
		const hash = await promisify(crypto.pbkdf2)(password, Uint8Array.from(Buffer.from(info.salt, 'latin1')), info.iterations, 64, 'sha512');
		return hash.compare(Uint8Array.from(Buffer.from(info.hash, 'latin1'))) === 0;
	}
}

async function setPassword(db: Database, userId: string, password: string) {
	const iterations = 100000;
	const salt = crypto.randomBytes(16);
	const hash = await promisify(crypto.pbkdf2)(password, Uint8Array.from(salt), iterations, 64, 'sha512');
	await db.data.hset(infoKey(userId), 'password', JSON.stringify({
		hash,
		iterations,
		salt: salt.toString('latin1'),
	}));
}

// HTTP Basic Auth
hooks.register('middleware', koa => {
	koa.use(async(context, next) => {
		const auth64 = context.headers.authorization && /^Basic (?<auth>.+)$/.exec(context.headers.authorization)?.groups?.auth;
		if (auth64) {
			const auth = Buffer.from(auth64, 'base64').toString();
			const colon = auth.indexOf(':');
			const username = auth.substr(0, colon);
			const password = auth.substr(colon + 1);
			const userId = await findUserByName(context.db, username);
			if (userId && await checkPassword(context.db, userId, password)) {
				context.state.userId = userId;
			}
		}
		return next();
	});
});

// HTTP form login
hooks.register('route', {
	method: 'post',
	path: '/api/auth/signin',

	async execute(context) {
		const { email, password } = context.request.body;
		const userId = await findUserByName(context.db, email);
		if (userId) {
			if (await checkPassword(context.db, userId, password)) {
				context.state.userId = userId;
				return { ok: 1, token: await context.flushToken() };
			}
		}
		context.status = 401;
		return 'Unauthorized';
	},
});

// Password update page
hooks.register('route', {
	method: 'post',
	path: '/api/user/password',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { oldPassword, password } = context.request.body;
		if (
			typeof password !== 'string' || password.length < 8 ||
			await checkPassword(context.db, userId, oldPassword) === false
		) {
			return { error: 'Invalid password' };
		}
		await setPassword(context.db, userId, password);
		return { ok: 1 };
	},
});

// Register Account
hooks.register('route', {
	method: 'post',
	path: '/api/register/submit',

	async execute(context) {
		const { username, email, password } = context.request.body;
		if (!User.checkUsername(username)) {
			return { error: 'invalid' };
		}
		if (await User.findUserByName(context.db, username)) {
			return { error: 'exists' };
		}
		if (allowEmailRegistration) {
			const newUserId = Id.generateId(12);
			await User.create(context.db, newUserId, username, [ { provider: 'email', id: email } ]);
			await setPassword(context.db, newUserId, password);
			return { ok: 1 };
		} else {
			context.status = 500;
			return { error: 'registration disabled' };
		}
	},
});

// Add password flag and email to user info payload
hooks.register('sendUserInfo', async(db, userId, userInfo, privateSelf) => {
	if (privateSelf) {
		const password = await db.data.hget(infoKey(userId), 'password');
		if (password) {
			userInfo.password = true;
		}
		const email = await User.providerIdForUser(db, 'email', userId);
		if (email) {
			userInfo.email = email;
		}
	}
});
