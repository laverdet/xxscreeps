import { hooks } from 'xxscreeps/backend';

hooks.register('route', {
	path: '/api/user/stats',

	execute() {
		return { ok: 1, stats: {} };
	},
});
