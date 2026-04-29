import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { QueuedNotification } from './notifications.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { upsertNotification } from './model.js';

/**
 * Coerce each queued entry: stringify message and truncate to 500 chars, clamp groupInterval to
 * [0, 1440] minutes (non-numeric → 0), then persist via `upsertNotification`. The save hook and
 * the test path both go through here.
 */
export async function dispatchQueuedNotifications(
	shard: Shard, userId: string, queued: Iterable<QueuedNotification>,
) {
	for (const entry of queued) {
		const message = `${entry.message}`.slice(0, 500);
		const groupInterval = typeof entry.groupInterval === 'number' && Number.isFinite(entry.groupInterval)
			? Math.min(1440, Math.max(0, entry.groupInterval)) : 0;
		await upsertNotification(shard, userId, entry.type, message, groupInterval);
	}
}

hooks.register('runnerConnector', player => [ undefined, {
	async save(result) {
		const queued = result.notificationsQueued;
		if (queued && queued.length > 0) {
			await dispatchQueuedNotifications(player.shard, player.userId, queued);
		}
	},
} ]);
