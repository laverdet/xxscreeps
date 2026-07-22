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
//   - per room: one hash per (room, interval) in shard storage, fields `<userId>/<stat>/<bucket>`.
//     Drives the world-map layer (a single `hGetAll` enumerates every contributor) and the
//     room-overview punchcards.
//   - per user: one hash per (user, interval) in `db.data` (like GCL), so a player's account totals
//     aggregate naturally across shards.

// The three intervals the client offers, keyed by minutes-per-bucket, mapped to the number of
// buckets that make up the displayed window.
export const bucketCount = {
	8: 8, // 8min * 8 ~= 1h
	180: 8, // 180min * 8 = 24h
	1440: 7, // 1440min * 7 = 7d
} as const;
type StatInterval = keyof typeof bucketCount;
export const statIntervals = Object.keys(bucketCount).map(Number) as StatInterval[];

export function isStatInterval(value: number): value is StatInterval {
	return value in bucketCount;
}

type FieldOf = (stat: StatName, bucket: number) => string;
const roomStatsKey = (roomName: string, interval: StatInterval) => `room/${roomName}/stats/${interval}`;
const roomUserStatsField = (userId: string): FieldOf => (stat: StatName, bucket: number) => `${userId}/${stat}/${bucket}`;
const scopeStatsField: FieldOf = (stat: StatName, bucket: number) => `${stat}/${bucket}`;
const userStatsKey = (userId: string, interval: StatInterval) => `user/${userId}/stats/${interval}`;
const bucketOf = (interval: StatInterval, time: number) => Math.floor(time / interval / 60_000);

// The bucket indices, oldest first, that make up the window for `interval` at `now`
// bucket = wallTime / interval / 60_000
function windowBuckets(interval: StatInterval, now: number) {
	const latest = bucketOf(interval, now) + 1;
	return [ ...Fn.range(latest - bucketCount[interval], latest) ];
}

interface StatEntry {
	amount: number;
	stat: StatName;
	userId: string;
}

interface BucketedStatEntry extends StatEntry {
	bucket: number;
}

// Drop every field of a stats hash whose trailing bucket index has aged out of the window. This can
// be used on room and user hashes.
async function truncateExpired(data: KeyValProvider, key: string, oldest: number) {
	const fields = await data.hKeys(key);
	const expired = fields.filter(field => Number(field.slice(field.lastIndexOf('/') + 1)) < oldest);
	if (expired.length > 0) {
		return data.hDel(key, expired);
	}
}

/**
 * Dump one room's accumulated bucket into every interval resolution: the per-(room, user) hashes in
 * shard storage and the per-user account hashes in `db.data`. `bucketTime` is the wall-clock time
 * the bucket began to fill; the whole batch is credited to the bucket it falls in. Expired fields
 * of every touched hash are reclaimed here as well.
 */
export async function writeRoomBucket(shard: Shard, roomName: string, entries: Iterable<StatEntry>, bucketTime: number) {
	await Promise.all(function*() {
		const statsByUser = Fn.groupBy(entries, entry => [ entry.userId, entry ]);
		for (const interval of statIntervals) {
			const roomKey = roomStatsKey(roomName, interval);
			const bucket = bucketOf(interval, bucketTime);
			const oldest = bucket - bucketCount[interval] + 1;
			for (const [ userId, userEntries ] of statsByUser) {
				const roomStatsField = roomUserStatsField(userId);
				// Room stats, per user
				// nb: Users could be coalesced into one incr per stat per room but most of the time there's
				// only one user in a room.
				for (const { stat, amount } of userEntries) {
					yield shard.data.hincrBy(roomKey, roomStatsField(stat, bucket), amount);
				}

				// User stats
				const userKey = userStatsKey(userId, interval);
				for (const { stat, amount } of userEntries) {
					yield shard.db.data.hincrBy(userKey, scopeStatsField(stat, bucket), amount);
				}
				// ..truncated per user
				yield truncateExpired(shard.db.data, userKey, oldest);
			}
			// ..truncated once per room
			yield truncateExpired(shard.data, roomKey, oldest);
		}
	}());
}

export type StatTotals = Record<StatName, number>;

// Aggregate all stats from the given scope (room, or user) over an interval
async function readAndAggregate(data: KeyValProvider, key: string, fieldOf: FieldOf, interval: StatInterval, now: number) {
	const buckets = windowBuckets(interval, now);
	const values = await Fn.pipe(
		statNames,
		$$ => Fn.transform($$, stat => Fn.map(buckets, bucket => fieldOf(stat, bucket))),
		$$ => data.hmGet(key, [ ...$$ ]));
	return Fn.fromEntries(statNames, stat => {
		const total = Fn.accumulate(buckets, bucket => Number(values[fieldOf(stat, bucket)] ?? 0));
		return [ stat, total ] as const;
	});
}

// Parse and iterate *all* stats entries belonging to the given room
async function iterateRoomStatEntries(shard: Shard, roomName: string, interval: StatInterval): Promise<Iterable<BucketedStatEntry>> {
	return Fn.pipe(
		await shard.data.hGetAll(roomStatsKey(roomName, interval)),
		$$ => Object.entries($$),
		$$ => Fn.map($$, ([ field, amount ]): BucketedStatEntry | undefined => {
			const [ userId, stat, bucket ] = field.split('/');
			if (userId !== undefined && stat !== undefined && isStatName(stat)) {
				return {
					amount: Number(amount),
					bucket: Number(bucket),
					stat,
					userId,
				};
			}
		}),
		$$ => Fn.filter($$));
}

/**
 * Sum each stat over the window for `interval` — the aggregated account totals the profile /
 * overview tiles display. Aggregates across shards; the not-yet-flushed room buckets are not
 * included here.
 */
export function readUserTotals(db: Database, userId: string, interval: StatInterval, now = Date.now()): Promise<StatTotals> {
	return readAndAggregate(db.data, userStatsKey(userId, interval), scopeStatsField, interval, now);
}

/**
 * Punchcard for one user's activity in the given room for a single interval.
 */
export async function readRoomPunchcard(data: KeyValProvider, roomName: string, userId: string, interval: StatInterval, stat: StatName, now = Date.now()): Promise<number[]> {
	const fieldOf = roomUserStatsField(userId);
	const buckets = windowBuckets(interval, now);
	const values = await data.hmGet(roomStatsKey(roomName, interval), buckets.map(bucket => fieldOf(stat, bucket)));
	return buckets.map(bucket => Number(values[fieldOf(stat, bucket)] ?? 0));
}

interface OverviewBucket {
	endTime: number;
	value: number;
}

type OverviewPunchcard = Record<StatName, OverviewBucket[]>;

/**
 * Punchcard for all activity in a given room over the active bucket period.
 */
export async function readCompleteRoomPunchcard(shard: Shard, roomName: string, interval: StatInterval, now = Date.now()): Promise<OverviewPunchcard> {
	const buckets = windowBuckets(interval, now);
	const punchcardByName = Fn.pipe(
		statNames,
		$$ => Fn.map($$, stat => {
			const punchcard = buckets.map((bucket): OverviewBucket => ({ endTime: bucket + 1, value: 0 }));
			return [ stat, punchcard ] as const;
		}),
		$$ => Fn.fromEntries($$));
	const entries = await iterateRoomStatEntries(shard, roomName, interval);
	for (const { amount, bucket, stat } of entries) {
		const bucketId = buckets.indexOf(bucket);
		if (bucketId !== -1) {
			punchcardByName[stat][bucketId]!.value += amount;
		}
	}
	return punchcardByName;
}

interface UserRoomBucket {
	user: string;
	value: number;
}

/**
 * Every contributing user's aggregated total amount for a single stat in a room, highest first.
 */
export async function readRoomLayer(shard: Shard, roomName: string, interval: StatInterval, statName: StatName, now = Date.now()): Promise<UserRoomBucket[]> {
	const entries = await iterateRoomStatEntries(shard, roomName, interval);
	const oldest = bucketOf(interval, now) - bucketCount[interval] + 1;
	const values = new Map<string, number>();
	for (const { amount, bucket, stat, userId } of entries) {
		if (stat === statName && bucket >= oldest) {
			values.set(userId, (values.get(userId) ?? 0) + Number(amount));
		}
	}
	return Fn.pipe(
		values,
		$$ => Fn.map($$, ([ user, value ]) => ({ user, value })),
		$$ => Fn.filter($$, ({ value }) => value > 0),
		$$ => [ ...$$ ],
		$$ => $$.sort(mappedInvertedNumericComparator(entry => entry.value)));
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
