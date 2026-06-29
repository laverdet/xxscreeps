import type { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import badge from './badge.js';
import './auth.js';
import './code.js';
import './profile.js';
import './stats.js';
import './world.js';

// Private messaging endpoints (incl. `/api/user/messages/unread-count`) live in the `messages` mod.
const endpoints = [ ...badge ];
export default endpoints;

hooks.register('route', {
	path: '/api/user/decorations/themes',
	execute() {
		return {
			ok: 1,
			list: [],
		};
	},
});

hooks.register('route', {
	path: '/api/user/decorations/inventory',
	execute() {
		return {
			ok: 1,
			list: [],
		};
	},
});

hooks.register('route', {
	path: '/api/user/tutorial-done',
	method: 'post',
	execute() {
		return { ok: 1 };
	},
});

interface MoneyHistoryRequest {
	page?: string | null;
}

const moneyHistorySchema: JSONSchemaType<MoneyHistoryRequest> = {
	type: 'object',
	properties: {
		page: { type: 'string', nullable: true },
	},
};

hooks.register('route', {
	path: '/api/user/money-history',
	execute: makeValidatedQueryRoute(moneyHistorySchema, context => ({
		ok: 1,
		page: Number(context.request.query.page) || 0,
		list: [],
		hasMore: false,
	})),
});
