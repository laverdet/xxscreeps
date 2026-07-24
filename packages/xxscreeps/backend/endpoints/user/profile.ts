import type { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import { config } from 'xxscreeps/config/index.js';
import { invaderBadge } from 'xxscreeps/engine/db/user/badge.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

const { allowGuestAccess } = config.backend;
const sendUserInfo = hooks.makeMapped('sendUserInfo');

hooks.register('route', {
	path: '/api/auth/me',

	async execute(context) {
		await context.flushToken(true);
		if (context.state.providerId !== undefined) {
			// Authenticated with provider, registration not complete
			return { ok: 1, _id: context.state.userId };

		} else if (context.state.userId !== undefined) {
			// Real user
			const { userId } = context.state;
			const info = {};
			const [ user ] = await Promise.all([
				User.loadBackendUserInfo(context.db, userId),
				User.findProvidersForUser(context.db, userId),
				Promise.all(sendUserInfo(context.db, userId, info, true)),
			]);
			return Object.assign(info, {
				ok: 1,
				_id: userId,
				cpu: 100,
				...user,
			});

		} else if (allowGuestAccess) {
			// Guest profile
			return {
				ok: 1,
				_id: 'guest',
				cpu: 100,
				username: 'Guest',
				email: 'nobody@example.com',
				badge: invaderBadge,
			};
		}
	},
});

interface FindUserRequest {
	username: string;
}

const findQueryQuerySchema: JSONSchemaType<FindUserRequest> = {
	type: 'object',
	properties: {
		username: { type: 'string' },
	},
	required: [ 'username' ],
};

hooks.register('route', {
	path: '/api/user/find',

	execute: makeValidatedQueryRoute(findQueryQuerySchema, async context => {
		const userId = await User.findUserByName(context.db, context.request.query.username);
		if (userId !== null) {
			const info = {};
			const [ user ] = await Promise.all([
				User.loadBackendUserInfo(context.db, userId),
				Promise.all(sendUserInfo(context.db, userId, info, false)),
			]);
			return {
				ok: 1,
				user: Object.assign(info, {
					_id: userId,
					username: user?.username,
					badge: user?.badge ?? undefined,
				}),
			};
		}
	}),
});
