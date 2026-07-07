import type { StatName } from './model.js';
import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { pruneRoomContributors, writeRoomStats, writeStats } from './model.js';

type StatMap = Map<StatName, number>;

// Per-processor-context (one room-tick) accumulator, so a room full of harvesters produces a handful
// of `hincrBy`s per subject instead of one per creep per tick. Every contribution is keyed by both
// the acting user (for the account-level totals) and the (room, user) pair (for the per-room series).
interface PendingDeltas {
	users: Map<string, StatMap>;
	roomUsers: Map<string, Map<string, StatMap>>;
}
const pending = new WeakMap<ProcessorContext, PendingDeltas>();

function accumulate(stats: StatMap, stat: StatName, value: number) {
	stats.set(stat, (stats.get(stat) ?? 0) + value);
}

/**
 * Record a stat contribution from within a processor. The value is attributed to the acting user
 * (account-wide totals) and to that user's activity in `roomName` (per-room series), coalesced for
 * the current room-tick and flushed once processing completes. NPC ids (two chars or fewer, e.g.
 * invaders/keepers) and no-op values are ignored.
 */
export function addStat(context: ProcessorContext, userId: string | null | undefined, roomName: string, stat: StatName, value: number) {
	if (value === 0 || userId == null || userId.length <= 2) {
		return;
	}
	let deltas = pending.get(context);
	if (deltas === undefined) {
		deltas = { users: new Map(), roomUsers: new Map() };
		pending.set(context, deltas);
		// Deferred (see `flush`) so every synchronous `addStat` this tick lands before we write.
		context.task(flush(context, deltas));
	}
	accumulate(getOrSet(deltas.users, userId, () => new Map<StatName, number>()), stat, value);
	const roomUsers = getOrSet(deltas.roomUsers, roomName, () => new Map<string, StatMap>());
	accumulate(getOrSet(roomUsers, userId, () => new Map<StatName, number>()), stat, value);
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
		...Fn.transform(deltas.roomUsers, ([ roomName, users ]) => [
			// Once per room: reclaim contributors whose activity has aged out of the widest window.
			pruneRoomContributors(context.shard.data, roomName, now),
			...Fn.map(users, ([ userId, stats ]) =>
				writeRoomStats(context.shard.data, roomName, userId, stats, now)),
		]),
	]);
}
