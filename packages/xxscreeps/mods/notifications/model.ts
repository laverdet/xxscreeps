import type { Shard } from 'xxscreeps/engine/db/index.js';
import { createHash } from 'node:crypto';

export type NotificationType = 'msg' | 'error';

const userIndexKey = (userId: string) => `user/${userId}/notifications`;
const rowKey = (userId: string, rowId: string) => `user/${userId}/notifications/${rowId}`;

function rowIdFor(type: NotificationType, timeGroup: number, message: string) {
	return createHash('sha1').update(`${type}${timeGroup}${message}`).digest('hex');
}

/**
 * Persist a notification, coalescing within `groupInterval` minutes (clamped to [0, 1440]).
 * `message` and `groupInterval` are assumed already coerced by the caller (the runner connector).
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
		]);
	} else {
		await shard.data.hincrBy(key, 'count', 1);
	}
}
