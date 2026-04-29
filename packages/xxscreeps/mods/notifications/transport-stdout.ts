import { notifyHooks } from './hooks.js';

notifyHooks.register('sendUserNotifications', (userId, notifications) => {
	for (const row of notifications) {
		console.log(JSON.stringify({
			event: 'notify',
			userId,
			message: row.message,
			date: row.date,
			count: row.count,
			type: row.type,
		}));
	}
});
