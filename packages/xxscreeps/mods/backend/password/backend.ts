import type { Database } from 'xxscreeps/engine/db/index.js';
import * as crypto from 'node:crypto';
import { promisify } from 'node:util';
import { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import config from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { findUserByName, findUserByProvider, infoKey } from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';

const { allowEmailRegistration } = config.backend;

async function checkPassword(db: Database, userId: string, password: string) {
	const info = await async function() {
		const payload = await db.data.hGet(infoKey(userId), 'password');
		try {
			return JSON.parse(payload!);
		} catch {}
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
	await db.data.hSet(infoKey(userId), 'password', JSON.stringify({
		hash,
		iterations,
		salt: salt.toString('latin1'),
	}));
}

// HTTP Basic Auth
hooks.register('middleware', koa => {
	koa.use(async (context, next): Promise<unknown> => {
		const auth64 = context.headers.authorization === undefined ? undefined : /^Basic (?<auth>.+)$/.exec(context.headers.authorization)?.groups?.auth;
		if (auth64 !== undefined) {
			const auth = Buffer.from(auth64, 'base64').toString();
			const colon = auth.indexOf(':');
			const username = auth.substr(0, colon);
			const password = auth.substr(colon + 1);
			const userId = await findUserByName(context.db, username) ?? await findUserByProvider(context.db, 'email', username);
			if (userId !== null && await checkPassword(context.db, userId, password)) {
				context.state.userId = userId;
			}
		}
		return next();
	});
});

interface SigninRequest {
	email: string;
	password: string;
}

const signinRequestSchema: JSONSchemaType<SigninRequest> = {
	type: 'object',
	properties: {
		email: { type: 'string' },
		password: { type: 'string' },
	},
	required: [ 'email', 'password' ],
};

// HTTP form login
hooks.register('route', {
	method: 'post',
	path: '/api/auth/signin',

	execute: makeValidatedPayloadRoute(signinRequestSchema, async context => {
		const { email, password } = context.request.body;
		const userId = await findUserByName(context.db, email) ?? await findUserByProvider(context.db, 'email', email);
		if (userId !== null) {
			if (await checkPassword(context.db, userId, password)) {
				context.state.userId = userId;
				return { ok: 1, token: await context.flushToken() };
			}
		}
		context.status = 401;
		return 'Unauthorized';
	}),
});

interface PasswordUpdateRequest {
	oldPassword: string;
	password: string;
}

const passwordUpdateRequestSchema: JSONSchemaType<PasswordUpdateRequest> = {
	type: 'object',
	properties: {
		oldPassword: { type: 'string' },
		password: { type: 'string' },
	},
	required: [ 'oldPassword', 'password' ],
};

// Password update page
hooks.register('route', {
	method: 'post',
	path: '/api/user/password',

	execute: makeValidatedPayloadRoute(passwordUpdateRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const { oldPassword, password } = context.request.body;
		if (
			password.length < 8 ||
			await checkPassword(context.db, userId, oldPassword) === false
		) {
			return { error: 'Invalid password' };
		}
		await setPassword(context.db, userId, password);
		return { ok: 1 };
	}),
});

interface RegisterBodyRequestSchema {
	email: string;
	password: string;
	username: string;
}

const registerRequestSchema: JSONSchemaType<RegisterBodyRequestSchema> = {
	type: 'object',
	properties: {
		username: { type: 'string' },
		email: { type: 'string' },
		password: { type: 'string' },
	},
	required: [ 'username', 'email', 'password' ],
};

// Register Account
hooks.register('route', {
	method: 'post',
	path: '/api/register/submit',

	execute: makeValidatedPayloadRoute(registerRequestSchema, async context => {
		const { username, email, password } = context.request.body;
		if (!User.checkUsername(username)) {
			return { error: 'invalid' };
		}
		if (await User.findUserByName(context.db, username) !== null) {
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
	}),
});

// Add password flag and email to user info payload
hooks.register('sendUserInfo', async (db, userId, userInfo, privateSelf) => {
	if (privateSelf) {
		const password = await db.data.hGet(infoKey(userId), 'password');
		if (password !== null) {
			userInfo.password = true;
		}
		const email = await User.providerIdForUser(db, 'email', userId);
		if (email !== null) {
			userInfo.email = email;
		}
	}
});
