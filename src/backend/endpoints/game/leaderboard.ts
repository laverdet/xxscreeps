import { hooks } from 'xxscreeps/backend';

hooks.register('route', {
	path: '/api/leaderboard/find',
	execute(context) {
		if (context.query.season) {
			return { error: 'Result not found' };
		} else {
			return { ok: 1, list: [] };
		}
	},
});

hooks.register('route', {
	path: '/api/leaderboard/list',
	execute() {
		return { ok: 1, list: [], count: 0, users: {} };
	},
});

hooks.register('route', {
	path: '/api/leaderboard/seasons',
	execute() {
		return { ok: 1, seasons: [] };
	},
});
