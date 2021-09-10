import type { Endpoint } from 'xxscreeps/backend';
import * as User from 'xxscreeps/engine/db/user';

function validateEmail(email: any) {
	return typeof email === 'string' && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}

const CheckEmailEndpoint: Endpoint = {
	path: '/api/register/check-email',

	execute(context) {
		const { email } = context.query;
		if (!validateEmail(email)) {
			return { error: 'invalid' };
		}
		return { ok: 1 };
	},
};

const CheckUsernameEndpoint: Endpoint = {
	path: '/api/register/check-username',

	async execute(context) {
		const username = `${context.query.username}`;
		if (!User.checkUsername(username)) {
			return { error: 'invalid' };
		}
		if (await User.findUserByName(context.db, username)) {
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
		const { username } = context.request.body;
		if (provider === undefined || providerId === undefined) {
			return { error: 'not authenticated' };
		} else if (userId !== undefined || newUserId === undefined) {
			return { error: 'username already set' };
		}

		// Sanity check
		if (!User.checkUsername(username)) {
			return { error: 'invalid' };
		}

		// Register
		await User.create(context.db, newUserId, username, [ { provider, id: providerId } ]);
		context.state.userId = newUserId;
		context.state.newUserId = undefined;
		context.state.provider = undefined;
		context.state.providerId = undefined;
		return { ok: 1, _id: newUserId, username };
	},
};

export default [ CheckEmailEndpoint, CheckUsernameEndpoint, SetUsernameEndpoint ];
