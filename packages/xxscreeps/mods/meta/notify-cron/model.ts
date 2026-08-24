import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import type { NotificationType } from 'xxscreeps/mods/meta/notifications/transport.js';
import { createHash } from 'node:crypto';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export interface NotificationRow {
	user: string;
	message: string;
	date: number;
	count: number;
	type: NotificationType;
}

export const hooks = makeHookRegistration<{
	/**
	 * Fired at most once per user per drain pass, with every row whose group deadline has elapsed
	 * and after the user's `interval` cadence has been honored. Consumers which deliver
	 * notifications somewhere — a mailer, a chat bridge, an in-game inbox — hang off this rather
	 * than claiming the transport slot, which stores rows and admits only one owner. Rows are
	 * removed once the batch has been handed out, whether or not a consumer accepted it.
	 *
	 * The drain runs on `main`, so register from a consumer's own `main.ts`. A registration in
	 * `processor.ts` is the trap: the suite loads that slot, so the tests pass, but in production it
	 * loads only in the processor worker and never fires. The fan-out is awaited inside the shard
	 * tick, so a consumer which blocks on slow I/O holds up every player on the shard.
	 */
	deliver: (shard: Shard, userId: string, rows: readonly NotificationRow[]) => Promise<unknown>;
}>();

// Sorted set: score = the group deadline in ms; coalesce-forever rows score 0 and are always due.
// Member = rowId.
const userIndexKey = (userId: string) => `user/${userId}/notifications`;
const rowKey = (userId: string, rowId: string) => `user/${userId}/notifications/${rowId}`;
// Sorted set: score = ms when the user's next drain is due, member = userId.
const dueUsersKey = 'notifications/dueUsers';
// Cadence cursor for the drain. Global like `notifyPrefs` itself, so an N-shard server delivers
// once per interval rather than once per interval per shard.
const lastNotifyDateKey = (userId: string) => `user/${userId}/notifications/lastDate`;

export const kDefaultIntervalMinutes = 60;

function rowIdFor(type: NotificationType, timeGroup: number, message: string) {
	return createHash('sha1').update(JSON.stringify([ type, timeGroup, message ])).digest('hex');
}

interface IndexedRow {
	id: string;
	row: NotificationRow;
}

async function readRows(shard: Shard, userId: string, ids: Iterable<string>): Promise<IndexedRow[]> {
	return Fn.mapAwait(ids, async (id): Promise<IndexedRow> => {
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

// Paired with the ids the drain deletes them by.
export async function getDueNotifications(shard: Shard, userId: string, nowMs: number) {
	const ids = await shard.data.zRange(userIndexKey(userId), 0, nowMs, { by: 'SCORE' });
	return readRows(shard, userId, ids);
}

export async function getAllRowsForTesting(shard: Shard, userId: string) {
	const items = await getDueNotifications(shard, userId, Infinity);
	return items.map(item => item.row);
}

export async function getLastNotifyDate(db: Database, userId: string): Promise<number> {
	const value = await db.data.get(lastNotifyDateKey(userId));
	return value === null ? 0 : Number(value);
}

export async function setLastNotifyDate(db: Database, userId: string, time: number) {
	await db.data.set(lastNotifyDateKey(userId), String(time));
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
	const [ created ] = await Promise.all([
		shard.data.hSet(key, 'count', 1, { if: 'NX' }),
		shard.data.hSet(key, 'date', date, { if: 'NX' }),
		shard.data.hmSet(key, { message, type }),
		shard.data.zAdd(userIndexKey(userId), [ [ timeGroup, id ] ]),
		scheduleUserDrain(shard, userId, timeGroup),
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
	const timeGroup = function() {
		if (intervalMs === Infinity) {
			return 0;
		} else {
			return intervalMs > 0 ? Math.ceil(now / intervalMs) * intervalMs : now;
		}
	}();
	await recordNotification(shard, userId, type, message, timeGroup, now);
}
