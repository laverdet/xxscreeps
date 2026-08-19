import type { Shard } from 'xxscreeps/engine/db/index.js';
import { makeProviderRegistration } from 'xxscreeps/utility/hook.js';

export type NotificationType = 'msg' | 'error';

export interface NotificationSend {
	userId: string;
	type: NotificationType;
	message: string;
	groupInterval: number;
}

export interface NotificationTransport {
	send: (shard: Shard, notification: NotificationSend) => void | Promise<void>;
}

/**
 * `groupInterval` sentinel: coalesce with every earlier occurrence of the same message. Out of
 * player reach -- the driver's coercion clamps `Game.notify` intervals to finite [0, 1440].
 */
export const kCoalesceForever = Infinity;

/**
 * Delivery seam for user notifications. Producers run in three different services -- the runner
 * persists `Game.notify` results, the processor emits attack and controller notifications, and the
 * backend sends message notifications -- so the slot is a provider rather than a `ProcessorContext`
 * method. Exactly one transport mod may register; without one, notifications are dropped.
 */
export const notificationTransport = makeProviderRegistration<NotificationTransport>('notifications', {
	send: () => {},
});

/**
 * Deliver a notification through the registered transport. `groupInterval` is a coalescing hint in
 * minutes which transports without their own grouping are free to ignore. `message` and
 * `groupInterval` are assumed already coerced by the caller.
 */
export async function sendNotification(
	shard: Shard, userId: string, type: NotificationType, message: string, groupInterval = 0,
) {
	await notificationTransport.current.send(shard, { userId, type, message, groupInterval });
}

/** @internal */
export function captureNotificationsForTesting() {
	const sent: NotificationSend[] = [];
	const registration = notificationTransport.overrideForTesting({
		send(shard, notification) {
			sent.push(notification);
		},
	});
	return {
		sent,
		[Symbol.dispose]: () => registration[Symbol.dispose](),
	};
}
