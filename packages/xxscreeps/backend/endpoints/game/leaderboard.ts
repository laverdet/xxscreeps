import { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';

interface LeaderboardFindRequest {
	season?: string | null;
}

const leaderboardFindSchema: JSONSchemaType<LeaderboardFindRequest> = {
	type: 'object',
	properties: {
		season: { type: 'string', nullable: true },
	},
};

hooks.register('route', {
	path: '/api/leaderboard/find',
	execute: makeValidatedQueryRoute(leaderboardFindSchema, context => {
		if (context.request.query.season === undefined) {
			return { error: 'Result not found' };
		} else {
			return { ok: 1, list: [] };
		}
	}),
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
