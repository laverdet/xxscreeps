import { hooks } from 'xxscreeps/backend/index.js';

hooks.register('route', {
	path: '/api/user/stats',

	execute() {
		return { ok: 1, stats: {} };
	},
});
