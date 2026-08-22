import type { JSONSchemaType } from 'ajv';
import type { Endpoint } from 'xxscreeps/backend/index.js';
import { makeValidatedPayloadRoute, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

interface CheckUsernameRequest {
	username: string;
}

const checkUsernameRequestSchema: JSONSchemaType<CheckUsernameRequest> = {
	type: 'object',
	properties: {
		username: { type: 'string' },
	},
	required: [ 'username' ],
};

const CheckUsernameEndpoint: Endpoint = {
	method: 'get',
	path: '/api/register/check-username',

	execute: makeValidatedQueryRoute(checkUsernameRequestSchema, async context => {
		const { username } = context.request.query;
		if (!User.checkUsername(username)) {
			return { error: 'invalid' };
		}
		if (await User.findUserByName(context.db, username) !== null) {
			return { error: 'exists' };
		}
		return { ok: 1 };
	}),
};

interface SetUsernameRequest {
	email?: string | null;
	username: string;
}

const setUsernameRequestSchema: JSONSchemaType<SetUsernameRequest> = {
	type: 'object',
	properties: {
		email: { type: 'string', nullable: true },
		username: { type: 'string' },
	},
	required: [ 'username' ],
};

const SetUsernameEndpoint: Endpoint = {
	method: 'post',
	path: '/api/register/set-username',

	execute: makeValidatedPayloadRoute(setUsernameRequestSchema, async context => {

		// Check for new reg provider
		const { provider, providerId, userId, newUserId } = context.state;
		if (provider === undefined || providerId === undefined) {
			return { error: 'not authenticated' };
		} else if (userId !== undefined || newUserId === undefined) {
			return { error: 'username already set' };
		}

		// Sanity check
		const { username, email: maybeEmail } = context.request.body;
		const email = maybeEmail === '' ? undefined : maybeEmail;
		if (!User.checkUsername(username) || (email != null && !User.checkEmail(email))) {
			return { error: 'invalid' };
		}

		// Register
		const providers = [ { provider, id: providerId } ];
		if (email != null) {
			providers.push({ provider: User.emailProvider, id: email });
		}
		await User.create(context.db, newUserId, username, providers);
		context.state.userId = newUserId;
		context.state.newUserId = undefined;
		context.state.provider = undefined;
		context.state.providerId = undefined;
		return { ok: 1, _id: newUserId, username };
	}),
};

const endpoints = [ CheckUsernameEndpoint, SetUsernameEndpoint ];
export default endpoints;
