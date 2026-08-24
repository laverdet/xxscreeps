import type { Shard } from 'xxscreeps/engine/db/index.js';
import { everyNTicks, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { getNotifyPrefs } from 'xxscreeps/mods/meta/notifications/prefs.js';
import { consumeDueUsers, getDueNotifications, getLastNotifyDate, hooks, kDefaultIntervalMinutes, nextPendingDueAt, removeNotifications, scheduleUserDrain, setLastNotifyDate } from './model.js';

const deliverHooks = hooks.makeMapped('deliver');

async function drainUser(shard: Shard, userId: string) {
	const [ prefs, lastNotifyDate ] = await Promise.all([
		getNotifyPrefs(shard.db, userId),
		getLastNotifyDate(shard.db, userId),
	]);
	const now = Date.now();
	const throttleEndsAt = lastNotifyDate + (prefs.interval ?? kDefaultIntervalMinutes) * 60_000;
	if (throttleEndsAt > now) {
		// Throttled — push the user's drain to the throttle deadline. Row groups maturing in the
		// meantime will be picked up at the same drain pass.
		await scheduleUserDrain(shard, userId, throttleEndsAt);
		return;
	}
	const items = await getDueNotifications(shard, userId, now);
	if (items.length > 0) {
		// Rows are removed even when a consumer rejects; keeping them would redeliver to the
		// consumers that did accept, on every later pass.
		await Fn.mapAwait(deliverHooks(shard, userId, items.map(item => item.row)), delivery =>
			delivery.catch(err => console.error(`Notification delivery failed for user ${userId}`, err)));
		await Promise.all([
			removeNotifications(shard, userId, items.map(item => item.id)),
			setLastNotifyDate(shard.db, userId, now),
		]);
	}
	const next = await nextPendingDueAt(shard, userId);
	if (next !== undefined) {
		await scheduleUserDrain(shard, userId, next);
	}
}

async function drainAndDeliver(shard: Shard) {
	const userIds = await consumeDueUsers(shard, Date.now());
	await Fn.mapAwait(userIds, userId => drainUser(shard, userId));
}

registerShardTickProcessor(everyNTicks(10, drainAndDeliver));
