import type { Database } from 'xxscreeps/engine/db/index.js';
import type { KeyValProvider } from 'xxscreeps/engine/db/storage/provider.js';
import { mappedInvertedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';

// Gameplay statistics, matching the seven series the classic Angular client renders on the profile /
// overview pages. Two parallel series are kept:
//
//   - per-user, in the account-level `db.data` store (like GCL), so a player's totals aggregate
//     naturally across shards — each shard's processor `hincrBy`s into the same key. Drives the
//     profile tiles and the overview totals.
//   - per-room, in the per-shard `shard.data` store. Drives the overview / room-overview punchcards.
//
// Storage is a bucketed time series, never a rolling sum. For each interval resolution we keep one
// hash per subject; each field is `<statName>:<bucketIndex>` holding that bucket's accumulated value.
// A windowed total (or punchcard array) is just the sum of the N most-recent buckets, computed on
// read. Buckets are wall-clock based to match the client's hour/day/week labels.

export const statNames = [
	'energyControl',
	'energyHarvested',
	'energyConstruction',
	'energyCreeps',
	'creepsProduced',
	'creepsLost',
	'powerProcessed',
] as const;
export type StatName = typeof statNames[number];

// The three intervals the client offers, keyed by minutes-per-bucket, mapped to the number of
// buckets that make up the displayed window: 8min×8 ≈ 1h, 180min×8 = 24h, 1440min×7 = 7d.
export const bucketCount = {
	8: 8,
	180: 8,
	1440: 7,
} as const;
export type StatInterval = keyof typeof bucketCount;
export const statIntervals = Object.keys(bucketCount).map(Number) as StatInterval[];
// The longest window; a contributor with no activity across it is stale in every interval (narrower
// windows are subsets of it), so it bounds how long a user stays in a room's contributor index.
const widestInterval = Math.max(...statIntervals) as StatInterval;
// The wall-clock span, in ms, covered by `interval`'s displayed window.
const windowMs = (interval: StatInterval) => interval * bucketCount[interval] * 60_000;

export function isStatInterval(value: number): value is StatInterval {
	return value in bucketCount;
}

export function isStatName(value: string): value is StatName {
	return (statNames as readonly string[]).includes(value);
}

const userStatsKey = (userId: string, interval: StatInterval) => `user/${userId}/stats/${interval}`;
// Per-room stats are split by contributing user so the world-map layer can show each user's share and
// the overview/room-overview can pick out one user's activity. A sorted set indexes each contributor
// by the wall-clock time they last contributed, so the map layer can enumerate only the users still
// live in a window (a cheap score range) without touching their series, and stale contributors can be
// reclaimed off the read path (see `pruneRoomContributors`).
const roomUserStatsKey = (roomName: string, userId: string, interval: StatInterval) => `room/${roomName}/stats/${interval}/${userId}`;
const roomSeenKey = (roomName: string) => `room/${roomName}/stats/seen`;
const bucketOf = (interval: StatInterval, now: number) => Math.floor(now / (interval * 60_000));
const fieldOf = (stat: string, bucket: number) => `${stat}:${bucket}`;
// The bucket indices, oldest first, that make up the window for `interval` at `now`.
function windowBuckets(interval: StatInterval, now: number) {
	const points = bucketCount[interval];
	const latest = bucketOf(interval, now);
	return [ ...Fn.map(Fn.range(points), ii => latest - points + 1 + ii) ];
}

export type StatDeltas = Iterable<readonly [ StatName, number ]>;

// Shared bucketed-hash write: increment the current bucket and prune the one that just rolled out of
// the window. Reads only ever sum in-window buckets, so straggler fields left by an inactive stretch
// are harmless.
async function writeSeries(data: KeyValProvider, key: (interval: StatInterval) => string, deltas: StatDeltas, now: number) {
	const entries = [ ...deltas ].filter(([ , value ]) => value !== 0);
	if (entries.length === 0) {
		return;
	}
	const ops: Promise<unknown>[] = [];
	for (const interval of statIntervals) {
		const seriesKey = key(interval);
		const bucket = bucketOf(interval, now);
		for (const [ stat, value ] of entries) {
			ops.push(data.hincrBy(seriesKey, fieldOf(stat, bucket), value));
		}
		const expired = bucket - bucketCount[interval];
		ops.push(data.hDel(seriesKey, statNames.map(stat => fieldOf(stat, expired))));
	}
	await Promise.all(ops);
}

/**
 * Persist a batch of stat deltas for one user across every interval resolution.
 */
export function writeStats(data: KeyValProvider, userId: string, deltas: StatDeltas, now = Date.now()) {
	return writeSeries(data, interval => userStatsKey(userId, interval), deltas, now);
}

/**
 * Persist a batch of stat deltas for one user's activity in one room across every interval
 * resolution, and stamp the user's last-contribution time in the room's contributor index so the map
 * layer can enumerate them. `GT` keeps the score monotonic under out-of-order writes.
 */
export async function writeRoomStats(data: KeyValProvider, roomName: string, userId: string, deltas: StatDeltas, now = Date.now()) {
	await Promise.all([
		data.zAdd(roomSeenKey(roomName), [ [ now, userId ] ], { up: 'GT' }),
		writeSeries(data, interval => roomUserStatsKey(roomName, userId, interval), deltas, now),
	]);
}

/**
 * Reclaim a room's stale contributors: drop everyone whose last contribution has fallen out of the
 * widest window (and so is stale in every interval). Called off the read path — once per room per
 * processor flush — so map-stats reads never mutate. A no-op range delete when nothing has aged out.
 */
export function pruneRoomContributors(data: KeyValProvider, roomName: string, now = Date.now()) {
	return data.zRemRange(roomSeenKey(roomName), 0, now - windowMs(widestInterval));
}

export type StatTotals = Record<StatName, number>;

function emptyTotals(): StatTotals {
	return Fn.fromEntries(statNames, stat => [ stat, 0 ]);
}

async function readSeriesTotals(data: KeyValProvider, key: string, interval: StatInterval, now: number): Promise<StatTotals> {
	const buckets = windowBuckets(interval, now);
	const fields = statNames.flatMap(stat => buckets.map(bucket => fieldOf(stat, bucket)));
	const values = await data.hmGet(key, fields);
	const totals = emptyTotals();
	for (const stat of statNames) {
		for (const bucket of buckets) {
			const raw = values[fieldOf(stat, bucket)];
			if (raw != null) {
				totals[stat] += Number(raw);
			}
		}
	}
	return totals;
}

async function readSeriesPunchcard(data: KeyValProvider, key: string, interval: StatInterval, stat: StatName, now: number): Promise<number[]> {
	const buckets = windowBuckets(interval, now);
	const values = await data.hmGet(key, buckets.map(bucket => fieldOf(stat, bucket)));
	return buckets.map(bucket => Number(values[fieldOf(stat, bucket)] ?? 0));
}

/**
 * Sum each stat over the window for `interval`, i.e. the aggregated totals the profile / overview
 * tiles display.
 */
export function readTotals(db: Database, userId: string, interval: StatInterval, now = Date.now()): Promise<StatTotals> {
	return readSeriesTotals(db.data, userStatsKey(userId, interval), interval, now);
}

/**
 * One user's windowed totals for their activity in a room — the room-overview tiles (owner) draw
 * from this.
 */
export function readRoomTotals(data: KeyValProvider, roomName: string, userId: string, interval: StatInterval, now = Date.now()): Promise<StatTotals> {
	return readSeriesTotals(data, roomUserStatsKey(roomName, userId, interval), interval, now);
}

/**
 * One user's per-bucket series for a single stat in a room, oldest bucket first — the overview
 * punchcard (requesting user) and the room-overview punchcards (owner).
 */
export function readRoomPunchcard(data: KeyValProvider, roomName: string, userId: string, interval: StatInterval, stat: StatName, now = Date.now()): Promise<number[]> {
	return readSeriesPunchcard(data, roomUserStatsKey(roomName, userId, interval), interval, stat, now);
}

export interface RoomStatContribution {
	user: string;
	value: number;
}

/**
 * Every contributing user's windowed value for a single stat in a room, highest first — the
 * world-map stat layer. Only users who contributed within `interval`'s window can carry a non-zero
 * value, so enumeration is bounded to that score range in the contributor index; each survivor's one
 * requested stat is summed and the zeroes (active in the room but not in this stat) are dropped. A
 * pure read: stale-contributor reclamation lives on the write path (see `pruneRoomContributors`).
 */
export async function readRoomLayer(data: KeyValProvider, roomName: string, interval: StatInterval, stat: StatName, now = Date.now()): Promise<RoomStatContribution[]> {
	const users = await data.zRange(roomSeenKey(roomName), now - windowMs(interval), now, { by: 'SCORE' });
	const contributions = await Fn.mapAwait(users, async user => {
		const points = await readSeriesPunchcard(data, roomUserStatsKey(roomName, user, interval), interval, stat, now);
		return { user, value: Fn.accumulate(points) };
	});
	return contributions
		.filter(contribution => contribution.value > 0)
		.sort(mappedInvertedNumericComparator(contribution => contribution.value))
		.map(({ user, value }) => ({ user, value }));
}

interface StatLayer {
	stat: StatName;
	interval: StatInterval;
}

// The world-map requests a layer as `<statName><interval>`, e.g. `energyHarvested8`. The three
// intervals are unambiguous suffixes (only `8` ends in 8; `180`/`1440` end in 0).
export function parseStatLayer(layer: string): StatLayer | undefined {
	for (const interval of statIntervals) {
		const suffix = String(interval);
		if (layer.endsWith(suffix)) {
			const stat = layer.slice(0, -suffix.length);
			if (isStatName(stat)) {
				return { stat, interval };
			}
		}
	}
}

/**
 * Drop all of a user's account-level stat series. Wired into `User.remove`. Their contributions to
 * per-room series are left in place — they age out via the window prune, and the contributor index
 * drops them once their last contribution falls out of the widest window (see
 * `pruneRoomContributors`).
 */
export async function removeAllForUser(db: Database, userId: string) {
	await Promise.all(statIntervals.map(interval => db.data.del(userStatsKey(userId, interval))));
}
