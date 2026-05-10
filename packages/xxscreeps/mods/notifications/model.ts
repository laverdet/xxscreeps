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
		const fields = await shard.data.hgetall(rowKey(userId, id));
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

export async function getNotifications(
	shard: Shard, userId: string,
): Promise<{ id: string; row: NotificationRow }[]> {
	const ids = await getNotificationIds(shard, userId);
	return readRows(shard, userId, ids);
}

export async function getNotificationIds(shard: Shard, userId: string): Promise<string[]> {
	return shard.data.zrange(userIndexKey(userId), 0, -1);
}

// Rows whose group due time has elapsed (score ≤ `nowMs`).
export async function getDueNotifications(
	shard: Shard, userId: string, nowMs: number,
): Promise<{ id: string; row: NotificationRow }[]> {
	const ids = await shard.data.zrange(userIndexKey(userId), 0, nowMs, { by: 'score' });
	return readRows(shard, userId, ids);
}

// When the user's next group becomes due, or undefined if nothing is queued.
export async function nextPendingDueAt(shard: Shard, userId: string): Promise<number | undefined> {
	const head = await shard.data.zrangeWithScores(userIndexKey(userId), 0, 0);
	return head[0]?.[0];
}

export async function removeNotifications(shard: Shard, userId: string, ids: string[]) {
	if (ids.length === 0) return;
	await Promise.all([
		shard.data.zrem(userIndexKey(userId), ids),
		...ids.map(id => shard.data.del(rowKey(userId, id))),
	]);
}

// Pop users whose scheduled drain time has elapsed. Caller owns rescheduling via `scheduleUserDrain`.
export async function consumeDueUsers(shard: Shard, nowMs: number): Promise<string[]> {
	const userIds = await shard.data.zrange(dueUsersKey, 0, nowMs, { by: 'score' });
	if (userIds.length > 0) {
		await shard.data.zrem(dueUsersKey, userIds);
	}
	return userIds;
}

// Schedule a user's next drain, keeping the sooner of any existing entry.
export async function scheduleUserDrain(shard: Shard, userId: string, dueAt: number) {
	await shard.data.zadd(dueUsersKey, [ [ dueAt, userId ] ], { up: 'lt' });
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
	const id = rowIdFor(type, timeGroup, message);
	const key = rowKey(userId, id);
	// Read-then-write is safe because the runner serializes save() per user.
	const existing = await shard.data.hget(key, 'count');
	if (existing === null) {
		await Promise.all([
			shard.data.hmset(key, { message, date: now, count: 1, type }),
			shard.data.zadd(userIndexKey(userId), [ [ timeGroup, id ] ]),
			scheduleUserDrain(shard, userId, timeGroup),
		]);
	} else {
		await shard.data.hincrBy(key, 'count', 1);
	}
}
