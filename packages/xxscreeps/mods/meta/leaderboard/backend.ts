import type { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { isLeaderboardMode, readAllRanks, readPage, readRank, readSeasons, seasonName } from './model.js';

// `GET /api/leaderboard/seasons` — the season picker of the rank pages. The client redirects
// `#!/rank/world` to the head of this list without checking it, so it is never empty.
hooks.register('route', {
	path: '/api/leaderboard/seasons',

	async execute(context) {
		const seasons = await readSeasons(context.db);
		return {
			ok: 1,
			seasons: seasons.map(season => ({ _id: season, name: seasonName(season) })),
		};
	},
});

interface LeaderboardListQuery {
	mode: string;
	season: string;
	limit?: number;
	offset?: number;
}

const leaderboardListSchema: JSONSchemaType<LeaderboardListQuery> = {
	type: 'object',
	properties: {
		mode: { type: 'string' },
		season: { type: 'string' },
		limit: { type: 'integer', minimum: 1, maximum: 100, nullable: true },
		offset: { type: 'integer', minimum: 0, nullable: true },
	},
	required: [ 'mode', 'season' ],
};

// `GET /api/leaderboard/list?mode=world&season=2026-07&offset=0&limit=10` — one page of a
// leaderboard plus the referenced players, which the list template renders by user id.
hooks.register('route', {
	path: '/api/leaderboard/list',

	execute: makeValidatedQueryRoute(leaderboardListSchema, async context => {
		const { mode, season, limit = 10, offset = 0 } = context.request.query;
		if (!isLeaderboardMode(mode)) {
			// Game modes this server doesn't run, e.g. `arena`
			return { ok: 1, list: [], count: 0, users: {} };
		}
		const { count, list } = await readPage(context.db, mode, season, offset, limit);
		const users = Object.fromEntries(await Fn.mapAwait(list, async ({ user }) => {
			const info = await User.loadBackendUserInfo(context.db, user);
			return [ user, { _id: user, ...info } ] as const;
		}));
		return { ok: 1, count, list: list.map(entry => ({ season, ...entry })), users };
	}, { coerceTypes: true }),
});

interface LeaderboardFindQuery {
	mode: string;
	username: string;
	season?: string | null;
}

const leaderboardFindSchema: JSONSchemaType<LeaderboardFindQuery> = {
	type: 'object',
	properties: {
		mode: { type: 'string' },
		username: { type: 'string' },
		season: { type: 'string', nullable: true },
	},
	required: [ 'mode', 'username' ],
};

// `GET /api/leaderboard/find?mode=world&username=…[&season=2026-07]` — one player's standing. With
// a season this answers "my rank" and the search box; without one the profile page reads every
// season at once. Being unranked is an error response, which the client catches everywhere.
hooks.register('route', {
	path: '/api/leaderboard/find',

	execute: makeValidatedQueryRoute(leaderboardFindSchema, async context => {
		const { mode, season, username } = context.request.query;
		const userId = await User.findUserByName(context.db, username);
		if (userId === null || !isLeaderboardMode(mode)) {
			return season == null ? { ok: 1, list: [] } : { error: 'Result not found' };
		} else if (season == null) {
			return { ok: 1, list: await readAllRanks(context.db, mode, userId) };
		}
		const entry = await readRank(context.db, mode, season, userId);
		if (entry === undefined) {
			return { error: 'Result not found' };
		}
		return { ok: 1, season, ...entry };
	}),
});
