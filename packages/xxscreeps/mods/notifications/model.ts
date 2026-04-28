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

function rowIdFor(type: NotificationType, date: number, message: string) {
	return createHash('sha1').update(`${type}${date}${message}`).digest('hex');
}

export async function getNotifications(shard: Shard, userId: string): Promise<NotificationRow[]> {
	const ids = await shard.data.smembers(userIndexKey(userId));
	return Promise.all(Fn.map(ids, async id => {
		const fields = await shard.data.hgetall(rowKey(userId, id));
		return {
			user: userId,
			message: fields.message,
			date: Number(fields.date),
			count: Number(fields.count),
			type: fields.type as NotificationType,
		};
	}));
}

export async function upsertNotification(
	shard: Shard, userId: string, message: string, date: number, type: NotificationType,
) {
	const id = rowIdFor(type, date, message);
	const key = rowKey(userId, id);
	const existing = await shard.data.hget(key, 'count');
	if (existing === null) {
		await Promise.all([
			shard.data.hmset(key, { message, date, count: 1, type }),
			shard.data.sadd(userIndexKey(userId), [ id ]),
		]);
	} else {
		await shard.data.hincrBy(key, 'count', 1);
	}
}
