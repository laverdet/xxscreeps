import type { Shard } from 'xxscreeps/engine/db/index.js';
import { everyNTicks, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { consumeDueUsers, flushNotifications, getDueNotifications, nextPendingDueAt, removeNotifications, scheduleUserDrain } from './model.js';
import { DEFAULT_INTERVAL_MIN, getLastNotifyDate, getNotifyPrefs, setLastNotifyDate } from './prefs.js';
import { transports } from './transports.js';
import './transport-stdout.js';

async function drainUser(shard: Shard, userId: string) {
	const [ prefs, lastNotifyDate ] = await Promise.all([
		getNotifyPrefs(shard.db, userId),
		getLastNotifyDate(shard, userId),
	]);
	if (prefs.disabled) {
		await flushNotifications(shard, userId);
		return;
	}
	const intervalMs = (prefs.interval ?? DEFAULT_INTERVAL_MIN) * 60_000;
	const now = Date.now();
	const throttleEndsAt = lastNotifyDate + intervalMs;
	if (throttleEndsAt > now) {
		// Throttled — push the user's drain to the throttle deadline. Row groups maturing in
		// the meantime will be picked up at the same drain pass.
		await scheduleUserDrain(shard, userId, throttleEndsAt);
		return;
	}
	const items = await getDueNotifications(shard, userId, now);
	if (items.length > 0) {
		const rows = items.map(item => item.row);
		await Promise.all(Fn.map(transports, async fn => fn(userId, rows)));
		await Promise.all([
			removeNotifications(shard, userId, items.map(item => item.id)),
			setLastNotifyDate(shard, userId, now),
		]);
	}
	const next = await nextPendingDueAt(shard, userId);
	if (next !== undefined) {
		await scheduleUserDrain(shard, userId, next);
	}
}

async function drainAndDeliver(shard: Shard) {
	const userIds = await consumeDueUsers(shard, Date.now());
	if (userIds.length === 0) return;
	await Fn.mapAwait(userIds, userId => drainUser(shard, userId));
}

registerShardTickProcessor(everyNTicks(10, shard => drainAndDeliver(shard)));
