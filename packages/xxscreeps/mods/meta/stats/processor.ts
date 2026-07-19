import { RoomProcessor, registerRoomTickProcessor } from 'xxscreeps/engine/processor/room.js';
import { statIntervals, writeRoomBucket } from './model.js';
import { isStatName } from './schema.js';

declare module 'xxscreeps/engine/processor/room.js' {
	interface RoomProcessor {
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		incrementRoomStat(userId: string | null | undefined, stat: string, amount: number): void;
	}
}

// Accumulate contributions directly on the room blob, which is being written every tick anyway.
// NPC ids (two characters or fewer, e.g. invaders / keepers) are ignored.
RoomProcessor.prototype.incrementRoomStat = function(userId, stat, amount) {
	if (amount === 0 || userId == null || userId.length <= 2) {
		return;
	}
	if (!isStatName(stat)) {
		throw new Error(`Unknown room stat: ${stat}`);
	}
	const stats = this.room['#userStats'];
	if (stats.length === 0) {
		this.room['#userStatsTime'] = Date.now();
	}
	const entry = stats.find(entry => entry.userId === userId && entry.stat === stat);
	if (entry) {
		entry.amount += amount;
	} else {
		stats.push({ amount, stat, userId });
	}
	this.didUpdate();
};

// A room's bucket is flushed once wall-clock time has crossed the next boundary of the finest
// interval plus the room's jitter, so attribution error is bounded by two buckets at the finest
// resolution and the cadence lands at ~8 minutes by itself
const flushIntervalMs = Math.min(...statIntervals) * 60_000;

// Deterministic per-room delay within one flush interval, spreading the dumps across ticks instead
// of every room hitting redis on the first tick after a bucket boundary
function jitterOf(roomName: string) {
	let hash = 0;
	for (let ii = 0; ii < roomName.length; ++ii) {
		hash = (Math.imul(hash, 31) + roomName.charCodeAt(ii)) | 0;
	}
	return (hash >>> 0) % flushIntervalMs;
}

registerRoomTickProcessor((room, context) => {
	const entries = room['#userStats'];
	if (entries.length === 0) {
		return;
	}
	const bucketTime = room['#userStatsTime'];
	const deadline = (Math.floor(bucketTime / flushIntervalMs) + 1) * flushIntervalMs + jitterOf(room.name);
	if (Date.now() < deadline) {
		return;
	}
	// Snapshot and clear before this tick's intents run, so their contributions begin a fresh
	// bucket instead of being wiped along with the flushed one. The batch is credited to the
	// bucket the timestamp falls in, not the flush time.
	const batch = entries.map(({ amount, stat, userId }) => ({ amount, stat, userId }));
	room['#userStats'] = [];
	room['#userStatsTime'] = 0;
	context.didUpdate();
	context.task(writeRoomBucket(context.shard, room.name, batch, bucketTime));
});
