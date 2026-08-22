import type { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import { checkEmail, emailForUser, findUserByEmail } from 'xxscreeps/engine/db/user/index.js';

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

// Tells the registration form whether an address is free before it is submitted
hooks.register('route', {
	method: 'get',
	path: '/api/register/check-email',

	execute: makeValidatedQueryRoute(checkEmailRequestSchema, async context => {
		const { email } = context.request.query;
		if (!checkEmail(email)) {
			return { error: 'invalid' };
		}
		if (await findUserByEmail(context.db, email) !== null) {
			return { error: 'exists' };
		}
		return { ok: 1 };
	}),
});

// Report the address back to the account which owns it, and to nobody else
hooks.register('sendUserInfo', async (db, userId, userInfo, privateSelf) => {
	if (privateSelf) {
		const email = await emailForUser(db, userId);
		if (email !== null) {
			userInfo.email = email;
		}
	}
});
