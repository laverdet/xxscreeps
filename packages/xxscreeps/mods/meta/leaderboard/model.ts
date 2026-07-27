import type { Database } from 'xxscreeps/engine/db/index.js';
import type { StatEntry } from 'xxscreeps/mods/meta/stats/model.js';
import type { StatName } from 'xxscreeps/mods/meta/stats/schema.js';
import { Fn } from 'xxscreeps/functional/fn.js';

// A leaderboard is the cumulative, per-season view of a stat which `mods/meta/stats` otherwise only
// keeps as a rolling window. Both scores the client ranks players by are already recorded as stat
// contributions, so nothing new is measured here: the leaderboard subscribes to the stat flush and
// accumulates the same numbers into one sorted set per (mode, season).
//
// Like GCL and the account-level stat totals these live in `db.data` rather than shard storage, so a
// player's standing aggregates across shards.
//
// A board is never rewritten once its scores land, not even to drop a deleted user: taking an entry
// out renumbers everyone below it and quietly rewrites a month which has already been played. The
// entry stays and the backend renders it as a tombstone, since a rank is a record of the season, not
// of the account.

// The two modes the client ranks: `world` is the "Expansion Rank" page (control points spent on
// upgrading), `power` the "Power Rank" page (power processed in power spawns).
const leaderboardModes = {
	power: 'powerProcessed',
	world: 'energyControl',
} as const satisfies Record<string, StatName>;

export type LeaderboardMode = keyof typeof leaderboardModes;
const leaderboardModeNames = Object.keys(leaderboardModes) as LeaderboardMode[];

export function isLeaderboardMode(value: string): value is LeaderboardMode {
	return leaderboardModeNames.some(mode => mode === value);
}

const modeByStat = new Map<StatName, LeaderboardMode>(Fn.map(
	Object.entries(leaderboardModes),
	([ mode, stat ]) => [ stat, mode as LeaderboardMode ] as const));

// zset: score = cumulative points in the season, member = userId
const leaderboardKey = (mode: LeaderboardMode, season: string) => `leaderboard/${mode}/${season}`;
// zset: score = start of the month, member = season id. Written the first time a score lands in a
// season, so the client's season list only offers months which actually ran.
const seasonsKey = 'leaderboard/seasons';

const monthNames = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A season is a calendar month in UTC, as on the official server, where a player's rank resets at
 * the turn of the month. The client treats the id as opaque and only ever echoes it back.
 */
export function seasonOf(time: number) {
	const date = new Date(time);
	return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}`;
}

function seasonStart(season: string) {
	const [ year, month ] = season.split('-');
	return Date.UTC(Number(year), Number(month) - 1);
}

/** Display name of a season, e.g. `July 2026`. Deliberately not locale-dependent. */
export function seasonName(season: string) {
	const [ year, month ] = season.split('-');
	return `${monthNames[Number(month) - 1] ?? month} ${year}`;
}

/**
 * Every season which holds a score, newest first. The current one is always included, even before
 * anyone has scored in it — the client dereferences the head of this list without checking.
 */
export async function readSeasons(db: Database, now = Date.now()) {
	const seasons = await db.data.zRange(seasonsKey, Infinity, -Infinity, { by: 'SCORE', rev: true });
	// The current month sorts ahead of every recorded one, so it can only be missing, never buried.
	const current = seasonOf(now);
	return seasons[0] === current ? seasons : [ current, ...seasons ];
}

/**
 * Credit a batch of stat contributions to the season `time` falls in. Contributions of stats which
 * don't back a leaderboard are ignored.
 */
export async function writeScores(db: Database, entries: Iterable<StatEntry>, time: number) {
	const scores = Fn.pipe(
		entries,
		$$ => Fn.map($$, entry => {
			const mode = modeByStat.get(entry.stat);
			return mode && { amount: entry.amount, mode, userId: entry.userId };
		}),
		$$ => Fn.filter($$),
		$$ => [ ...$$ ]);
	if (scores.length === 0) {
		return;
	}
	const season = seasonOf(time);
	await Promise.all(function*() {
		yield db.data.zAdd(seasonsKey, [ [ seasonStart(season), season ] ], { if: 'NX' });
		for (const { amount, mode, userId } of scores) {
			yield db.data.zIncrBy(leaderboardKey(mode, season), amount, userId);
		}
	}());
}

interface LeaderboardEntry {
	rank: number;
	score: number;
	user: string;
}

/**
 * One page of a leaderboard, highest score first, alongside the total number of ranked players.
 * `rank` is zero-based, as the client expects.
 */
export async function readPage(db: Database, mode: LeaderboardMode, season: string, offset: number, limit: number) {
	const key = leaderboardKey(mode, season);
	const [ count, page ] = await Promise.all([
		db.data.zCard(key),
		db.data.zRangeWithScores(key, offset, offset + limit - 1, { rev: true }),
	]);
	const list = page.map(([ score, user ], index): LeaderboardEntry => ({ rank: offset + index, score, user }));
	return { count, list };
}

/** A single player's standing in one season, or `undefined` when they haven't scored in it. */
export async function readRank(db: Database, mode: LeaderboardMode, season: string, userId: string) {
	const key = leaderboardKey(mode, season);
	const [ rank, score ] = await Promise.all([
		db.data.zRank(key, userId, { rev: true }),
		db.data.zScore(key, userId),
	]);
	if (rank !== null && score !== null) {
		return { rank, score, user: userId } satisfies LeaderboardEntry;
	}
}

/** A player's standing in every season they scored in, newest first. */
export async function readAllRanks(db: Database, mode: LeaderboardMode, userId: string, now = Date.now()) {
	const seasons = await readSeasons(db, now);
	const entries = await Fn.mapAwait(seasons, async season => {
		const entry = await readRank(db, mode, season, userId);
		return entry && { ...entry, season };
	});
	return [ ...Fn.filter(entries) ];
}
