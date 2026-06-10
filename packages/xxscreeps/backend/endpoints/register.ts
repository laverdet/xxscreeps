import type { JSONSchemaType } from 'ajv';
import type { Endpoint } from 'xxscreeps/backend/index.js';
import { makeValidatedPayloadRoute, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

function validateEmail(email: string) {
	return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}

interface CheckEmailRequest {
	email: string;
}

const checkEmailRequestSchema: JSONSchemaType<CheckEmailRequest> = {
	type: 'object',
	properties: {
		email: { type: 'string' },
	},
	required: [ 'email' ],
};

const CheckEmailEndpoint: Endpoint = {
	method: 'get',
	path: '/api/register/check-email',
	execute: makeValidatedQueryRoute(checkEmailRequestSchema, async context => {
		const { email } = context.request.query;
		if (!validateEmail(email)) {
			return { error: 'invalid' };
		}
		if (await User.findUserByProvider(context.db, 'email', email) !== null) {
			return { error: 'exists' };
		}
		return { ok: 1 };
	}),
};

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
		if (!User.checkUsername(username) || (email != null && !validateEmail(email))) {
			return { error: 'invalid' };
		}

		// Register
		const providers = [ { provider, id: providerId } ];
		if (email != null) {
			providers.push({ provider: 'email', id: email });
		}
		await User.create(context.db, newUserId, username, providers);
		context.state.userId = newUserId;
		context.state.newUserId = undefined;
		context.state.provider = undefined;
		context.state.providerId = undefined;
		return { ok: 1, _id: newUserId, username };
	}),
};

const endpoints = [ CheckEmailEndpoint, CheckUsernameEndpoint, SetUsernameEndpoint ];
export default endpoints;
