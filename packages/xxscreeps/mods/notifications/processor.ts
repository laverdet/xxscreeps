import type { Shard } from 'xxscreeps/engine/db/index.js';
import { registerUserIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { upsertNotification } from './model.js';

type NotifyData = { message: unknown; groupInterval: unknown };

registerUserIntentProcessor('notify', async (shard: Shard, userId: string, data: NotifyData) => {
	let groupInterval = data.groupInterval as number;
	if (groupInterval < 0) {
		groupInterval = 0;
	} else if (groupInterval > 1440) {
		groupInterval = 1440;
	}
	const intervalMs = Math.floor(groupInterval * 60_000);
	const now = Date.now();
	const date = intervalMs > 0 ? Math.ceil(now / intervalMs) * intervalMs : now;
	const message = String(data.message).substring(0, 500);
	await upsertNotification(shard, userId, message, date, 'msg');
});
