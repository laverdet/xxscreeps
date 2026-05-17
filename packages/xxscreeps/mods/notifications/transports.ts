import type { NotificationRow } from './model.js';

export type SendUserNotifications =
	(userId: string, notifications: NotificationRow[]) => void | Promise<void>;

export const transports: SendUserNotifications[] = [];

/**
 * Register a delivery transport. Returns a `Disposable` so tests can scope a transport to one
 * test via `using`. Operator-installed transports just leak the registration — they live for
 * the process lifetime.
 */
export function registerSendUserNotifications(fn: SendUserNotifications): Disposable {
	transports.push(fn);
	return {
		[Symbol.dispose]() {
			const idx = transports.indexOf(fn);
			if (idx >= 0) {
				transports.splice(idx, 1);
			}
		},
	};
}
