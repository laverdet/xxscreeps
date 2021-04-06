import type { Endpoint } from 'xxscreeps/backend';
import { checkUsername } from 'xxscreeps/backend/auth';
import { loadUser } from 'xxscreeps/backend/model/user';
import * as User from 'xxscreeps/engine/metadata/user';

const CheckEmailEndpoint: Endpoint = {
	path: '/api/register/check-email',

	execute(context) {
		if (context.query.email === undefined) {
			return { error: 'invalid' };
		}
		return { ok: 1 };
	},
};

const CheckUsernameEndpoint: Endpoint = {
	path: '/api/register/check-username',

	execute(context) {
		const username = `${context.query.username}`;
		if (!checkUsername(username)) {
			return { error: 'invalid' };
		}
		const usernameKey = context.backend.auth.usernameToProviderKey(username);
		if (context.backend.auth.lookupUserByProvider(usernameKey) !== undefined) {
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
		const { providerKey, userId, newUserId } = context.state;
		const { username } = context.request.body;
		if (providerKey === undefined || userId !== undefined) {
			return { error: 'username already set' };
		}

		// Sanity check
		if (!checkUsername(username)) {
			return { error: 'invalid' };
		}

		// Register
		return context.backend.gameMutex.scope(async() => {
			// Ensure account or steam reference doesn't already exist
			if (context.backend.auth.lookupUserByProvider(providerKey) !== undefined) {
				throw new Error(`Account already exists: ${providerKey}`);
			}
			if (await loadUser(context.backend, newUserId!).catch(() => {})) {
				throw new Error(`Username already set: ${newUserId}`);
			}
			const usernameKey = context.backend.auth.usernameToProviderKey(username);
			if (context.backend.auth.lookupUserByProvider(usernameKey) !== undefined) {
				throw new Error(`User already exists: ${username}`);
			}
			// Create user
			const user = User.create(username, newUserId);
			const userBlob = User.write(user);
			context.backend.auth.associateUser(usernameKey, user.id);
			context.backend.auth.associateUser(providerKey, user.id);
			context.state.userId = newUserId;
			context.state.newUserId = undefined;
			context.state.providerKey = undefined;
			await Promise.all([
				context.backend.auth.save(),
				context.backend.persistence.set(`user/${user.id}/info`, userBlob),
			]);
			// Success
			return { ok: 1, _id: user.id };
		});
	},
};

const SubmitRegistrationEndpoint: Endpoint = {
	method: 'post',
	path: '/api/register/submit',

	execute(context) {
		context.status = 500;
		return {};
	},
};

export default [ CheckEmailEndpoint, CheckUsernameEndpoint, SetUsernameEndpoint, SubmitRegistrationEndpoint ];
