import { hooks } from 'xxscreeps/backend/index.js';

hooks.register('route', {
	path: '/api/user/auth-token',

	execute() {
		return {
			ok: 1,
			tokens: [],
		};
	},
});
