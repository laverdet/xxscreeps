import { Endpoint, Response } from 'xxscreeps/backend/endpoint';
import { checkUsername, flattenUsername } from 'xxscreeps/backend/auth';
import { makeToken } from 'xxscreeps/backend/auth/token';
import { loadUser } from 'xxscreeps/backend/model/user';
import * as User from 'xxscreeps/engine/metadata/user';

const CheckEmailEndpoint: Endpoint = {
	path: '/check-email',

	execute(req) {
		if (req.query.email === undefined) {
			return { error: 'invalid' };
		}
		return { ok: 1 };
	},
};

const CheckUsernameEndpoint: Endpoint = {
	path: '/check-username',

	execute(req) {
		const { username } = req.query;
		if (!checkUsername(username)) {
			return { error: 'invalid' };
		}
		const usernameKey = `username:${flattenUsername(username)}`;
		if (this.context.lookupUserByProvider(usernameKey) !== undefined) {
			return { error: 'exists' };
		}
		return { ok: 1 };
	},
};

const SetUsernameEndpoint: Endpoint = {
	method: 'post',
	path: '/set-username',

	async execute(req, res) {

		// Check for new reg provider
		const { token, userid, body: { username } } = req;
		if (token === undefined) {
			return { error: 'username already set' };
		}

		// Sanity check
		if (!checkUsername(username)) {
			return { error: 'invalid' };
		}

		// Register
		return this.context.gameMutex.scope(async() => {
			// Ensure account or steam reference doesn't already exist
			if (this.context.lookupUserByProvider(token) !== undefined) {
				throw new Error(`Account already exists: ${token}`);
			}
			if (await loadUser(this.context, userid!).catch(() => {})) {
				throw new Error(`Username already set: ${userid}`);
			}
			const usernameKey = `username:${flattenUsername(username)}`;
			if (this.context.lookupUserByProvider(usernameKey) !== undefined) {
				throw new Error(`User already exists: ${username}`);
			}
			// Create user
			const user = User.create(username, userid);
			const userBlob = User.write(user);
			this.context.associateUser(usernameKey, user.id);
			this.context.associateUser(token, user.id);
			await Promise.all([
				this.context.save(),
				this.context.persistence.set(`user/${user.id}/info`, userBlob),
			]);
			// Update auth token
			res.set('X-Token', await makeToken(user.id));
			return { ok: 1, _id: user.id };
		});
	},
};

const SubmitRegistrationEndpoint: Endpoint = {
	method: 'post',
	path: '/submit',

	execute() {
		return Response(500, {});
	},
};

export default [ CheckEmailEndpoint, CheckUsernameEndpoint, SetUsernameEndpoint, SubmitRegistrationEndpoint ];
