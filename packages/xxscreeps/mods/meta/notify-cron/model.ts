import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { NotificationType } from 'xxscreeps/mods/meta/notifications/transport.js';
import { createHash } from 'node:crypto';
import { Fn } from 'xxscreeps/functional/fn.js';

export interface NotificationRow {
	user: string;
	message: string;
	date: number;
	count: number;
	type: NotificationType;
}

// Sorted set: score = due time (ms) -- the group deadline, or the latest occurrence for
// coalesce-forever rows. Member = rowId.
const userIndexKey = (userId: string) => `user/${userId}/notifications`;
const rowKey = (userId: string, rowId: string) => `user/${userId}/notifications/${rowId}`;
// Sorted set: score = ms when the user's next drain is due, member = userId.
const dueUsersKey = 'notifications/dueUsers';

function rowIdFor(type: NotificationType, timeGroup: number, message: string) {
	return createHash('sha1').update(JSON.stringify([ type, timeGroup, message ])).digest('hex');
}

async function readRows(shard: Shard, userId: string, ids: Iterable<string>): Promise<NotificationRow[]> {
	return Fn.mapAwait(ids, async (id): Promise<NotificationRow> => {
		const fields = await shard.data.hGetAll(rowKey(userId, id));
		return {
			user: userId,
			message: fields.message!,
			date: Number(fields.date),
			count: Number(fields.count),
			type: fields.type as NotificationType,
		};
	});
}

export async function getAllRowsForTesting(shard: Shard, userId: string) {
	const ids = await shard.data.zRange(userIndexKey(userId), 0, Infinity, { by: 'SCORE' });
	return readRows(shard, userId, ids);
}

export async function removeNotifications(shard: Shard, userId: string, ids: string[]) {
	if (ids.length === 0) return;
	await Promise.all([
		shard.data.zRem(userIndexKey(userId), ids),
		shard.data.mDel(...ids.map(id => rowKey(userId, id))),
	]);
}

// Pop users whose scheduled drain time has elapsed. Caller owns rescheduling via `scheduleUserDrain`.
export async function consumeDueUsers(shard: Shard, nowMs: number): Promise<string[]> {
	const userIds = await shard.data.zRange(dueUsersKey, 0, nowMs, { by: 'SCORE' });
	if (userIds.length > 0) {
		await shard.data.zRem(dueUsersKey, userIds);
	}
	return userIds;
}

// Schedule a user's next drain, keeping the sooner of any existing entry.
export async function scheduleUserDrain(shard: Shard, userId: string, dueAt: number) {
	await shard.data.zAdd(dueUsersKey, [ [ dueAt, userId ] ], { up: 'LT' });
}

export async function nextPendingDueAt(shard: Shard, userId: string): Promise<number | undefined> {
	const head = await shard.data.zRangeWithScores(userIndexKey(userId), 0, 0);
	return head[0]?.[0];
}

/**
 * Race-safe upsert. The per-occurrence fields claim their slot with `hSet … NX` (`count` seeds to
 * 1, `date` keeps the first occurrence), the content-derived fields and idempotent zadds fire
 * alongside, so the optimistic (new-row) path is a single round trip. Only an already-present row
 * pays the extra `hincrBy`. Same-tick events on one row — two attackers in a room, or the
 * processor's parallel `context.task` fan-out — converge on the right count without a read-then-write.
 */
async function recordNotification(
	shard: Shard, userId: string, type: NotificationType, message: string, timeGroup: number, date: number,
) {
	const id = rowIdFor(type, timeGroup, message);
	const key = rowKey(userId, id);
	// Coalesce-forever rows (timeGroup 0) index at their latest occurrence, so they stay due
	// immediately and retention counts from the last event rather than the first.
	const dueAt = timeGroup === 0 ? date : timeGroup;
	const [ created ] = await Promise.all([
		shard.data.hSet(key, 'count', 1, { if: 'NX' }),
		shard.data.hSet(key, 'date', date, { if: 'NX' }),
		shard.data.hmSet(key, { message, type }),
		shard.data.zAdd(userIndexKey(userId), [ [ dueAt, id ] ]),
		scheduleUserDrain(shard, userId, dueAt),
	]);
	if (!created) {
		await shard.data.hincrBy(key, 'count', 1);
	}
}

/**
 * Persist a notification, coalescing within `groupInterval` minutes. `Infinity` coalesces with
 * every earlier occurrence of the same message and is due immediately; `0` never coalesces.
 * `message` and `groupInterval` are assumed already coerced by the caller.
 */
export async function upsertNotification(
	shard: Shard, userId: string, type: NotificationType, message: string, groupInterval: number,
) {
	const intervalMs = groupInterval * 60_000;
	const now = Date.now();
	const timeGroup =
		intervalMs === Infinity ? 0 :
		intervalMs > 0 ? Math.ceil(now / intervalMs) * intervalMs : now;
	await recordNotification(shard, userId, type, message, timeGroup, now);
}

// Unread rows wait this long for a consumer (an in-game inbox or mailer), then drop.
export const kRetentionMs = 30 * 86_400_000;

/**
 * Drop rows whose due time elapsed more than `kRetentionMs` ago; a user whose later rows survive
 * goes back on the due-user index for their next expiry.
 */
export async function pruneExpiredNotifications(shard: Shard, nowMs: number) {
	const cutoff = nowMs - kRetentionMs;
	const userIds = await consumeDueUsers(shard, cutoff);
	await Fn.mapAwait(userIds, async userId => {
		const ids = await shard.data.zRange(userIndexKey(userId), 0, cutoff, { by: 'SCORE' });
		await removeNotifications(shard, userId, ids);
		const next = await nextPendingDueAt(shard, userId);
		if (next !== undefined) {
			await scheduleUserDrain(shard, userId, next);
		}
	});
}
