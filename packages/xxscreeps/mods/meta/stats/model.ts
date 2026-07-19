import type { StatName } from './schema.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import type { KeyValProvider } from 'xxscreeps/engine/db/storage/provider.js';
import { mappedInvertedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { isStatName, statNames } from './schema.js';

// Bucketed time series over wall-clock time, one hash field per bucket; a windowed total (or
// punchcard) is the sum of the most-recent buckets, computed on read. Written only by the periodic
// per-room dump (see `processor.ts`), so the youngest bucket lives on the room blob until it is
// flushed and readers merge it in via `pendingBucketOffset`.
//
//   - per room: one hash per (room, interval) in shard storage, fields `<userId>:<stat>:<bucket>`.
//     Drives the world-map layer (a single `hGetAll` enumerates every contributor) and the
//     room-overview punchcards.
//   - per user: one hash per (user, interval) in `db.data` (like GCL), so a player's account totals
//     aggregate naturally across shards.

// The three intervals the client offers, keyed by minutes-per-bucket, mapped to the number of
// buckets that make up the displayed window: 8min×8 ≈ 1h, 180min×8 = 24h, 1440min×7 = 7d.
export const bucketCount = {
	8: 8,
	180: 8,
	1440: 7,
} as const;
export type StatInterval = keyof typeof bucketCount;
export const statIntervals = Object.keys(bucketCount).map(Number) as StatInterval[];

export function isStatInterval(value: number): value is StatInterval {
	return value in bucketCount;
}

const userStatsKey = (userId: string, interval: StatInterval) => `user/${userId}/stats/${interval}`;
const roomStatsKey = (roomName: string, interval: StatInterval) => `room/${roomName}/stats/${interval}`;
const bucketOf = (interval: StatInterval, time: number) => Math.floor(time / (interval * 60_000));
// The bucket indices, oldest first, that make up the window for `interval` at `now`
function windowBuckets(interval: StatInterval, now: number) {
	const points = bucketCount[interval];
	const latest = bucketOf(interval, now);
	return [ ...Fn.map(Fn.range(points), ii => latest - points + 1 + ii) ];
}

export interface StatEntry {
	amount: number;
	stat: StatName;
	userId: string;
}

// Drop every field of a stats hash whose trailing bucket index has aged out of the window. The
// per-field reads only ever fetch in-window fields, but without the sweep an inactive stretch
// would strand its expired fields forever.
const reclaimExpired = (data: KeyValProvider, key: string, oldest: number) =>
	data.hKeys(key).then(fields => {
		const expired = fields.filter(field =>
			Number(field.slice(field.lastIndexOf(':') + 1)) < oldest);
		if (expired.length > 0) {
			return data.hDel(key, expired);
		}
	});

/**
 * Dump one room's accumulated bucket into every interval resolution: the per-(room, user) hashes in
 * shard storage and the per-user account hashes in `db.data`. `bucketTime` is the wall-clock time
 * the bucket began to fill; the whole batch is credited to the bucket it falls in. Expired fields
 * of every touched hash are reclaimed here as well.
 */
export async function writeRoomBucket(shard: Shard, roomName: string, entries: readonly StatEntry[], bucketTime: number) {
	await Promise.all(function*() {
		for (const interval of statIntervals) {
			const bucket = bucketOf(interval, bucketTime);
			const oldest = bucket - bucketCount[interval] + 1;
			const roomKey = roomStatsKey(roomName, interval);
			for (const { userId, stat, amount } of entries) {
				yield shard.data.hincrBy(roomKey, `${userId}:${stat}:${bucket}`, amount);
			}
			yield reclaimExpired(shard.data, roomKey, oldest);
			for (const [ userId, userEntries ] of Fn.groupBy(entries, entry => [ entry.userId, entry ])) {
				const userKey = userStatsKey(userId, interval);
				for (const { stat, amount } of userEntries) {
					yield shard.db.data.hincrBy(userKey, `${stat}:${bucket}`, amount);
				}
				yield reclaimExpired(shard.db.data, userKey, oldest);
			}
		}
	}());
}

export type StatTotals = Record<StatName, number>;

async function readTotals(data: KeyValProvider, key: string, fieldOf: (stat: StatName, bucket: number) => string, interval: StatInterval, now: number) {
	const buckets = windowBuckets(interval, now);
	const values = await data.hmGet(key, statNames.flatMap(stat => buckets.map(bucket => fieldOf(stat, bucket))));
	return Fn.fromEntries(statNames, stat =>
		[ stat, Fn.accumulate(buckets, bucket => Number(values[fieldOf(stat, bucket)] ?? 0)) ]);
}

/**
 * Sum each stat over the window for `interval` — the aggregated account totals the profile /
 * overview tiles display. Aggregates across shards; the not-yet-flushed room buckets are not
 * included here.
 */
export function readUserTotals(db: Database, userId: string, interval: StatInterval, now = Date.now()): Promise<StatTotals> {
	return readTotals(db.data, userStatsKey(userId, interval), (stat, bucket) => `${stat}:${bucket}`, interval, now);
}

/**
 * One user's windowed totals for their activity in a room — the room-overview tiles (owner) draw
 * from this.
 */
export function readRoomTotals(data: KeyValProvider, roomName: string, userId: string, interval: StatInterval, now = Date.now()): Promise<StatTotals> {
	return readTotals(data, roomStatsKey(roomName, interval), (stat, bucket) => `${userId}:${stat}:${bucket}`, interval, now);
}

/**
 * One user's per-bucket series for a single stat in a room, oldest bucket first — the overview
 * punchcard (requesting user) and the room-overview punchcards (owner).
 */
export async function readRoomPunchcard(data: KeyValProvider, roomName: string, userId: string, interval: StatInterval, stat: StatName, now = Date.now()): Promise<number[]> {
	const buckets = windowBuckets(interval, now);
	const values = await data.hmGet(roomStatsKey(roomName, interval), buckets.map(bucket => `${userId}:${stat}:${bucket}`));
	return buckets.map(bucket => Number(values[`${userId}:${stat}:${bucket}`] ?? 0));
}

export interface RoomStatContribution {
	user: string;
	value: number;
}

/**
 * Every contributing user's windowed value for a single stat in a room, highest first — the
 * world-map stat layer. One `hGetAll` enumerates the room's contributors; zero values (active in
 * the room but not in this stat) are dropped.
 */
export async function readRoomLayer(data: KeyValProvider, roomName: string, interval: StatInterval, stat: StatName, now = Date.now()): Promise<RoomStatContribution[]> {
	const fields = await data.hGetAll(roomStatsKey(roomName, interval));
	const oldest = bucketOf(interval, now) - bucketCount[interval] + 1;
	const values = new Map<string, number>();
	for (const [ field, value ] of Object.entries(fields)) {
		const [ user, fieldStat, bucket ] = field.split(':');
		if (fieldStat === stat && Number(bucket) >= oldest) {
			values.set(user!, (values.get(user!) ?? 0) + Number(value));
		}
	}
	return [ ...Fn.map(values, ([ user, value ]) => ({ user, value })) ]
		.filter(contribution => contribution.value > 0)
		.sort(mappedInvertedNumericComparator(contribution => contribution.value));
}

/**
 * Window position, oldest-first, of a room's not-yet-flushed blob bucket — `undefined` when the
 * bucket has already aged out of `interval`'s window. Readers use this to merge the blob's pending
 * entries into redis-backed results.
 */
export function pendingBucketOffset(interval: StatInterval, bucketTime: number, now = Date.now()): number | undefined {
	const points = bucketCount[interval];
	const offset = bucketOf(interval, bucketTime) - (bucketOf(interval, now) - points + 1);
	if (offset >= 0 && offset < points) {
		return offset;
	}
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
 * per-room hashes are left in place — the dump reclaims them as they age out of the window.
 */
export async function removeAllForUser(db: Database, userId: string) {
	await Promise.all(statIntervals.map(interval => db.data.del(userStatsKey(userId, interval))));
}
