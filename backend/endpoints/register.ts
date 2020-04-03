import { Endpoint, Response } from '~/backend/endpoint';
import { checkUsername, flattenUsername } from '~/backend/auth';
import { checkToken, makeToken } from '~/backend/auth/token';
import * as User from '~/engine/metadata/user';

export const CheckEmailEndpoint: Endpoint = {
	path: '/check-email',

	execute(req) {
		if (req.query.email === undefined) {
			return { error: 'invalid' };
		}
		return { ok: 1 };
	},
};

export const CheckUsernameEndpoint: Endpoint = {
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

export const SetUsernameEndpoint: Endpoint = {
	method: 'post',
	path: '/set-username',

	async execute(req, res) {
		// Sanity check
		const { username } = req.body;
		if (!checkUsername(username)) {
			return Response(500, undefined);
		}

		// Check for steam provider
		const tokenValue = (await checkToken(req.get('x-token')!))!;
		if (!/^steam:[0-9]+$/.test(tokenValue)) {
			return Response(400, undefined);
		}

		// Register
		return this.context.gameMutex.scope(async() => {
			// Ensure account or steam reference doesn't already exist
			if (this.context.lookupUserByProvider(tokenValue) !== undefined) {
				throw new Error('Steam account already exists');
			}
			const usernameKey = `username:${flattenUsername(username)}`;
			if (this.context.lookupUserByProvider(usernameKey) !== undefined) {
				throw new Error('User already exists');
			}
			// Create user
			const user = User.create(username);
			const userBlob = User.write(user);
			this.context.associateUser(usernameKey, user.id);
			this.context.associateUser(tokenValue, user.id);
			await Promise.all([
				this.context.save(),
				this.context.blobStorage.save(`user/${user.id}`, userBlob),
			]);
			// Update auth token
			res.set('X-Token', await makeToken(user.id));
			return { ok: 1, _id: user.id };
		});
	},
};

export const SubmitRegistrationEndpoint: Endpoint = {
	method: 'post',
	path: '/submit',

	execute() {
		return Response(500, {});
	},
};
