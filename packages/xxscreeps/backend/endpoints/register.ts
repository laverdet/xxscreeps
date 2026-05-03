import type { Endpoint } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

function validateEmail(email: string) {
	return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}

const CheckEmailEndpoint: Endpoint = {
	path: '/api/register/check-email',

	async execute(context) {
		const { email } = context.query;
		if (typeof email !== 'string' || !validateEmail(email)) {
			return { error: 'invalid' };
		}
		if (await User.findUserByProvider(context.db, 'email', email) !== null) {
			return { error: 'exists' };
		}
		return { ok: 1 };
	},
};

const CheckUsernameEndpoint: Endpoint = {
	path: '/api/register/check-username',

	async execute(context) {
		const { username } = context.query;
		if (typeof username !== 'string') {
			return { error: 'invalid' };
		}
		if (!User.checkUsername(username)) {
			return { error: 'invalid' };
		}
		if (await User.findUserByName(context.db, username) !== null) {
			return { error: 'exists' };
		}
		return { ok: 1 };
	},
};

const SetUsernameEndpoint: Endpoint = {
	method: 'post',
	path: '/api/register/set-username',

	async execute(context) {

		// Check for new reg provider
		const { provider, providerId, userId, newUserId } = context.state;
		interface Body {
			username: unknown;
			email?: unknown;
		}
		const { username, email } = context.request.body as Body;
		if (provider === undefined || providerId === undefined) {
			return { error: 'not authenticated' };
		} else if (userId !== undefined || newUserId === undefined) {
			return { error: 'username already set' };
		}

		// Sanity check
		if (
			typeof username !== 'string' ||
			!User.checkUsername(username) ||
			(
				email !== undefined &&
				email !== '' &&
				(typeof email !== 'string' || !validateEmail(email))
			)
		) {
			return { error: 'invalid' };
		}

		// Register
		await User.create(context.db, newUserId, username, [
			{ provider, id: providerId },
			...typeof email === 'string' && email !== '' ? [ { provider: 'email', id: email } ] : [],
		]);
		context.state.userId = newUserId;
		context.state.newUserId = undefined;
		context.state.provider = undefined;
		context.state.providerId = undefined;
		return { ok: 1, _id: newUserId, username };
	},
};

const endpoints = [ CheckEmailEndpoint, CheckUsernameEndpoint, SetUsernameEndpoint ];
export default endpoints;
