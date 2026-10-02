import { notificationTransport } from 'xxscreeps/mods/meta/notifications/transport.js';

notificationTransport.register({
	send(shard, { userId, type, message }) {
		console.log(JSON.stringify({ event: 'notify', message, type, userId }));
	},
});
