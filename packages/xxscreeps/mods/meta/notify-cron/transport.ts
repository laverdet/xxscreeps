import { notificationTransport } from 'xxscreeps/mods/meta/notifications/transport.js';
import { upsertNotification } from './model.js';

notificationTransport.register({
	send: (shard, { userId, type, message, groupInterval }) =>
		upsertNotification(shard, userId, type, message, groupInterval),
});
