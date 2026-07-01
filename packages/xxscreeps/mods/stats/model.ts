import type { Database } from 'xxscreeps/engine/db/index.js';
import type { KeyValProvider } from 'xxscreeps/engine/db/storage/provider.js';
import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
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

export function isStatInterval(value: number): value is StatInterval {
	return value in bucketCount;
}

export function isStatName(value: string): value is StatName {
	return (statNames as readonly string[]).includes(value);
}

const userStatsKey = (userId: string, interval: StatInterval) => `user/${userId}/stats/${interval}`;
const roomStatsKey = (roomName: string, interval: StatInterval) => `room/${roomName}/stats/${interval}`;
const bucketOf = (interval: StatInterval, now: number) => Math.floor(now / (interval * 60_000));
const fieldOf = (stat: string, bucket: number) => `${stat}:${bucket}`;
// The bucket indices, oldest first, that make up the window for `interval` at `now`.
function windowBuckets(interval: StatInterval, now: number) {
	const points = bucketCount[interval];
	const latest = bucketOf(interval, now);
	return Array.from({ length: points }, (unused, ii) => latest - points + 1 + ii);
}

type StatDeltas = Iterable<readonly [ StatName, number ]>;
type SubjectDeltas = Map<string, Map<StatName, number>>;

// Per-processor-context (one room-tick) accumulator, so a room full of harvesters produces a handful
// of `hincrBy`s per subject instead of one per creep per tick.
type PendingDeltas = { users: SubjectDeltas; rooms: SubjectDeltas };
const pending = new WeakMap<ProcessorContext, PendingDeltas>();

function accumulate(subjects: SubjectDeltas, key: string, stat: StatName, value: number) {
	let stats = subjects.get(key);
	if (!stats) {
		stats = new Map();
		subjects.set(key, stats);
	}
	stats.set(stat, (stats.get(stat) ?? 0) + value);
}

/**
 * Record a stat contribution from within a processor. The value is attributed both to `userId`
 * (unless it's an NPC — id of two chars or fewer) and to `roomName`, coalesced for the current
 * room-tick and flushed once processing completes.
 */
export function addStat(context: ProcessorContext, userId: string | null | undefined, roomName: string, stat: StatName, value: number) {
	if (value === 0) {
		return;
	}
	let deltas = pending.get(context);
	if (!deltas) {
		deltas = { users: new Map(), rooms: new Map() };
		pending.set(context, deltas);
		// Deferred (see `flush`) so every synchronous `addStat` this tick lands before we write.
		context.task(flush(context, deltas));
	}
	if (userId != null && userId.length > 2) {
		accumulate(deltas.users, userId, stat, value);
	}
	accumulate(deltas.rooms, roomName, stat, value);
}

async function flush(context: ProcessorContext, deltas: PendingDeltas) {
	// The processor runs `addStat` synchronously throughout the tick and only awaits queued tasks
	// afterward. Yield once here so the whole tick's contributions are collected before we read the
	// accumulator.
	await Promise.resolve();
	pending.delete(context);
	const now = Date.now();
	await Promise.all([
		...Fn.map(deltas.users, ([ userId, stats ]) =>
			writeStats(context.shard.db.data, userId, stats, now)),
		...Fn.map(deltas.rooms, ([ roomName, stats ]) =>
			writeRoomStats(context.shard.data, roomName, stats, now)),
	]);
}

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
 * Persist a batch of stat deltas for one user across every interval resolution. Exposed directly
 * (rather than only via `addStat`) so it can be driven from tests.
 */
export function writeStats(data: KeyValProvider, userId: string, deltas: StatDeltas, now = Date.now()) {
	return writeSeries(data, interval => userStatsKey(userId, interval), deltas, now);
}

/**
 * Persist a batch of stat deltas for one room across every interval resolution.
 */
export function writeRoomStats(data: KeyValProvider, roomName: string, deltas: StatDeltas, now = Date.now()) {
	return writeSeries(data, interval => roomStatsKey(roomName, interval), deltas, now);
}

export type StatTotals = Record<StatName, number>;

function emptyTotals(): StatTotals {
	return Object.fromEntries(statNames.map(stat => [ stat, 0 ])) as StatTotals;
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
 * The per-bucket series for a single stat, oldest bucket first — a user's own punchcard.
 */
export function readPunchcard(db: Database, userId: string, interval: StatInterval, stat: StatName, now = Date.now()): Promise<number[]> {
	return readSeriesPunchcard(db.data, userStatsKey(userId, interval), interval, stat, now);
}

/**
 * A room's aggregated totals over the window (all seven series), for the room-overview tiles.
 */
export function readRoomTotals(data: KeyValProvider, roomName: string, interval: StatInterval, now = Date.now()): Promise<StatTotals> {
	return readSeriesTotals(data, roomStatsKey(roomName, interval), interval, now);
}

/**
 * A room's per-bucket series for a single stat, oldest bucket first — the overview / room-overview
 * punchcard.
 */
export function readRoomPunchcard(data: KeyValProvider, roomName: string, interval: StatInterval, stat: StatName, now = Date.now()): Promise<number[]> {
	return readSeriesPunchcard(data, roomStatsKey(roomName, interval), interval, stat, now);
}

/**
 * Drop all of a user's stat series. Wired into `User.remove`.
 */
export async function removeAllForUser(db: Database, userId: string) {
	await Promise.all(statIntervals.map(interval => db.data.del(userStatsKey(userId, interval))));
}
