import type { Shard } from 'xxscreeps/engine/db/index.js';
import { createHash } from 'node:crypto';
import { Fn } from 'xxscreeps/functional/fn.js';

export type NotificationType = 'msg' | 'error';

export type NotificationRow = {
	user: string;
	message: string;
	date: number;
	count: number;
	type: NotificationType;
};

// Sorted set: score = group due time (ms), member = rowId.
const userIndexKey = (userId: string) => `user/${userId}/notifications`;
const rowKey = (userId: string, rowId: string) => `user/${userId}/notifications/${rowId}`;
// Sorted set: score = ms when the user's next drain is due, member = userId.
const dueUsersKey = 'notifications/dueUsers';

function rowIdFor(type: NotificationType, timeGroup: number, message: string) {
	return createHash('sha1').update(JSON.stringify([ type, timeGroup, message ])).digest('hex');
}

async function readRows(
	shard: Shard, userId: string, ids: Iterable<string>,
): Promise<{ id: string; row: NotificationRow }[]> {
	return Fn.mapAwait(ids, async (id): Promise<{ id: string; row: NotificationRow }> => {
		const fields = await shard.data.hGetAll(rowKey(userId, id));
		return {
			id,
			row: {
				user: userId,
				message: fields.message!,
				date: Number(fields.date),
				count: Number(fields.count),
				type: fields.type as NotificationType,
			},
		};
	});
}

export async function flushNotifications(shard: Shard, userId: string) {
	const ids = await shard.data.zRange(userIndexKey(userId), 0, -1);
	await removeNotifications(shard, userId, ids);
}

// Rows whose group due time has elapsed (score ≤ `nowMs`).
export async function getDueNotifications(
	shard: Shard, userId: string, nowMs: number,
): Promise<{ id: string; row: NotificationRow }[]> {
	const ids = await shard.data.zRange(userIndexKey(userId), 0, nowMs, { by: 'SCORE' });
	return readRows(shard, userId, ids);
}

export async function getAllRowsForTesting(shard: Shard, userId: string) {
	const notifications = await getDueNotifications(shard, userId, Infinity);
	return notifications.map(item => item.row);
}

// When the user's next group becomes due, or undefined if nothing is queued.
export async function nextPendingDueAt(shard: Shard, userId: string): Promise<number | undefined> {
	const head = await shard.data.zRangeWithScores(userIndexKey(userId), 0, 0);
	return head[0]?.[0];
}

export async function removeNotifications(shard: Shard, userId: string, ids: string[]) {
	if (ids.length === 0) return;
	await Promise.all([
		shard.data.zRem(userIndexKey(userId), ids),
		shard.data.mdel(...ids.map(id => rowKey(userId, id))),
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
	const [ created ] = await Promise.all([
		shard.data.hSet(key, 'count', 1, { if: 'NX' }),
		shard.data.hSet(key, 'date', date, { if: 'NX' }),
		shard.data.hmset(key, { message, type }),
		shard.data.zAdd(userIndexKey(userId), [ [ timeGroup, id ] ]),
		scheduleUserDrain(shard, userId, timeGroup),
	]);
	if (!created) {
		await shard.data.hincrBy(key, 'count', 1);
	}
}

/**
 * Persist a notification, coalescing within `groupInterval` minutes (clamped to [0, 1440]).
 * `message` and `groupInterval` are assumed already coerced by the caller.
 *
 * TODO: rows accumulate forever — no consumer prunes them, and the keyval layer doesn't yet
 * implement EXPIRE.
 */
export async function upsertNotification(
	shard: Shard, userId: string, type: NotificationType, message: string, groupInterval: number,
) {
	const intervalMs = groupInterval * 60_000;
	const now = Date.now();
	const timeGroup = intervalMs > 0 ? Math.ceil(now / intervalMs) * intervalMs : now;
	await recordNotification(shard, userId, type, message, timeGroup, now);
}

/**
 * Engine-fired notification: one row per (user, type, message), count++ per call.
 * Used by attack/event handlers; `upsertNotification` is for `Game.notify` with a
 * user-supplied `groupInterval`.
 */
export async function sendNotification(
	shard: Shard, userId: string, type: NotificationType, message: string,
) {
	await recordNotification(shard, userId, type, message, 0, Date.now());
}
