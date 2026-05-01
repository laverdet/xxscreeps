import type { QueuedNotification } from './notifications.js';
import { hooks } from 'xxscreeps/game/index.js';
import { flush, notify } from './notifications.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickResult {
		notificationsQueued?: QueuedNotification[];
	}
}

hooks.register('gameInitializer', Game => {
	Game.notify = notify;
});

hooks.register('runtimeConnector', {
	send(payload) {
		payload.notificationsQueued = flush();
	},
});
