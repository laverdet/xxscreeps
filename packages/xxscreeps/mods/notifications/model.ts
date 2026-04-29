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

const userIndexKey = (userId: string) => `user/${userId}/notifications`;
const rowKey = (userId: string, rowId: string) => `user/${userId}/notifications/${rowId}`;
// Sorted set: score = wall-clock ms when the user is next due to drain, member = userId. Mirrors
// the engine's own `sleepingRoomsKey` shape — same primitive applied to user-scope scheduling.
const dueUsersKey = 'notifications/dueUsers';

function rowIdFor(type: NotificationType, timeGroup: number, message: string) {
	return createHash('sha1').update(`${type}${timeGroup}${message}`).digest('hex');
}

export async function getNotifications(
	shard: Shard, userId: string,
): Promise<{ id: string; row: NotificationRow }[]> {
	const ids = await shard.data.smembers(userIndexKey(userId));
	return Fn.mapAwait(ids, async id => {
		const fields = await shard.data.hgetall(rowKey(userId, id));
		return {
			id,
			row: {
				user: userId,
				message: fields.message,
				date: Number(fields.date),
				count: Number(fields.count),
				type: fields.type as NotificationType,
			},
		};
	});
}

export async function getNotificationIds(shard: Shard, userId: string): Promise<string[]> {
	return shard.data.smembers(userIndexKey(userId));
}

export async function removeNotifications(shard: Shard, userId: string, ids: string[]) {
	if (ids.length === 0) return;
	await Promise.all([
		shard.data.srem(userIndexKey(userId), ids),
		...ids.map(id => shard.data.del(rowKey(userId, id))),
	]);
}

/**
 * Pop users whose scheduled drain time has elapsed. Caller owns rescheduling: a user that
 * isn't fully drained (throttle, transport failure) is re-added by `scheduleUserDrain`.
 */
export async function consumeDueUsers(shard: Shard, nowMs: number): Promise<string[]> {
	const userIds = await shard.data.zrange(dueUsersKey, 0, nowMs, { by: 'score' });
	if (userIds.length > 0) {
		await shard.data.zrem(dueUsersKey, userIds);
	}
	return userIds;
}

/**
 * Schedule (or re-schedule) a user's next drain. Overwrites any existing entry.
 */
export async function scheduleUserDrain(shard: Shard, userId: string, dueAt: number) {
	await shard.data.zadd(dueUsersKey, [ [ dueAt, userId ] ]);
}

/**
 * Persist a notification, coalescing within `groupInterval` minutes (clamped to [0, 1440]).
 * `message` and `groupInterval` are assumed already coerced by the caller (the runner connector).
 *
 * On first row for a user we also seed `dueUsersKey` with score = now (immediately due). The
 * drain re-evaluates against `prefs.interval` and reschedules precisely; seeding immediate
 * avoids a prefs read in the hot path of `Game.notify`.
 *
 * TODO: rows accumulate forever — no consumer prunes them, and the keyval layer doesn't yet
 * implement EXPIRE so we can't TTL them on write either.
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
			shard.data.sadd(userIndexKey(userId), [ id ]),
			shard.data.zadd(dueUsersKey, [ [ now, userId ] ], { if: 'nx' }),
		]);
	} else {
		await shard.data.hincrBy(key, 'count', 1);
	}
}
