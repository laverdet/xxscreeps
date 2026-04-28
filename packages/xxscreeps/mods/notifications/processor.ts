import { registerUserIntentHandler } from 'xxscreeps/engine/runner/intents.js';
import { upsertNotification } from './model.js';

declare module 'xxscreeps/game/intents.js' {
	interface UserIntent {
		notify: [ message: string, groupInterval: number | undefined ];
	}
}

registerUserIntentHandler('notify', async (shard, userId, message, groupInterval) => {
	const interval = typeof groupInterval === 'number' && Number.isFinite(groupInterval)
		? Math.min(1440, Math.max(0, groupInterval)) : 0;
	const intervalMs = interval * 60_000;
	const now = Date.now();
	const date = intervalMs > 0 ? Math.ceil(now / intervalMs) * intervalMs : now;
	// Vanilla parity: engine uses `'' + i.message`.
	const text = ('' + message).substring(0, 500);
	await upsertNotification(shard, userId, text, date, 'msg');
});
