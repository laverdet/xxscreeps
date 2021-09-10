import type { Database } from 'xxscreeps/engine/db';
import crypto from 'crypto';
import { promisify } from 'util';
import { hooks } from 'xxscreeps/backend';
import * as User from 'xxscreeps/engine/db/user';
import { findUserByName, infoKey } from 'xxscreeps/engine/db/user';
import * as Id from 'xxscreeps/engine/schema/id';

async function checkPassword(db: Database, userId: string, password: string) {
	const info = await async function() {
		const payload = await db.data.hget(infoKey(userId), 'password');
		try {
			return JSON.parse(payload!);
		} catch (err) {}
	}();
	if (info) {
		const hash = await promisify(crypto.pbkdf2)(password, Buffer.from(info.salt, 'latin1'), info.iterations, 64, 'sha512');
		return hash.compare(Buffer.from(info.hash, 'latin1')) === 0;
	}
}

async function setPassword(db: Database, userId: string, password: string) {
	const iterations = 100000;
	const salt = crypto.randomBytes(16);
	const hash = await promisify(crypto.pbkdf2)(password, salt, iterations, 64, 'sha512');
	await db.data.hset(infoKey(userId), 'password', JSON.stringify({
		hash,
		iterations,
		salt: salt.toString('latin1'),
	}));
}

async function setEmail(db: Database, userId: string, email: string) {
	await db.data.hset(infoKey(userId), 'email', email);
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
		const newUserId = Id.generateId(12);

		await User.create(context.db, newUserId, username, []);
		await setPassword(context.db, newUserId, password);
		await setEmail(context.db, newUserId, email);
		return { ok: 1 };
	},
});

// Add password flag and email to user info payload
hooks.register('sendUserInfo', async(db, userId, userInfo, privateSelf) => {
	if (privateSelf) {
		const profileData = await db.data.hmget(infoKey(userId), [ 'password', 'email' ]);
		if (profileData.password) {
			userInfo.password = true;
		}
		if (profileData.email) {
			userInfo.email = profileData.email;
		}
	}
});
