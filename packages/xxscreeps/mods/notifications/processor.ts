import type { Shard } from 'xxscreeps/engine/db/index.js';
import { everyNTicks, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { getHooks } from './hooks.js';
import { consumeDueUsers, getNotifications, removeNotifications, scheduleUserDrain } from './model.js';
import { DEFAULT_INTERVAL_MIN, getLastNotifyDate, getNotifyPrefs, setLastNotifyDate } from './prefs.js';
import './transport-stdout.js';

async function drainUser(shard: Shard, userId: string) {
	try {
		const [ prefs, items, lastNotifyDate ] = await Promise.all([
			getNotifyPrefs(shard, userId),
			getNotifications(shard, userId),
			getLastNotifyDate(shard, userId),
		]);
		if (items.length === 0) return;

		if (prefs.disabled) {
			await removeNotifications(shard, userId, items.map(item => item.id));
			return;
		}
		const intervalMs = (prefs.interval ?? DEFAULT_INTERVAL_MIN) * 60_000;
		const dueAt = lastNotifyDate + intervalMs;
		const now = Date.now();
		if (dueAt > now) {
			// Throttled — reschedule at the precise next-due time and exit. The next drain cycle
			// will pick this user up exactly when the per-user interval elapses.
			await scheduleUserDrain(shard, userId, dueAt);
			return;
		}
		const rows = items.map(item => item.row);
		for (const fn of getHooks('sendUserNotifications')) {
			await fn(userId, rows);
		}
		await Promise.all([
			removeNotifications(shard, userId, items.map(item => item.id)),
			setLastNotifyDate(shard, userId, now),
		]);
	} catch (err) {
		console.error(`notify drain failed for user ${userId}:`, err);
		// Reschedule a retry one default-interval out so a failing transport doesn't busy-loop.
		await scheduleUserDrain(shard, userId, Date.now() + DEFAULT_INTERVAL_MIN * 60_000);
	}
}

async function drainAndDeliver(shard: Shard) {
	const userIds = await consumeDueUsers(shard, Date.now());
	if (userIds.length === 0) return;
	await Fn.mapAwait(userIds, userId => drainUser(shard, userId));
}

registerShardTickProcessor(everyNTicks(10, (shard, ctx) => {
	ctx.task(drainAndDeliver(shard));
}));
