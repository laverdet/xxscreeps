import { hooks } from 'xxscreeps/backend';
import { getVisualChannel, loadVisuals } from './model';

hooks.register('roomSocket', async(shard, userId, roomName) => {
	if (!userId) {
		return;
	}

	// Subscribe to visuals channel and listen for publishes to this room
	let lastTime = shard.time;
	const unlisten = await getVisualChannel(shard, userId).listen<true>(message => {
		if (message.type === 'publish') {
			if (message.roomNames.includes('*') || message.roomNames.includes(roomName)) {
				lastTime = message.time;
			}
		}
	});

	return [
		unlisten,
		async time => {
			// Stringify visuals for this room only if visuals were sent for this room+time
			if (time <= lastTime) {
				const visual = await loadVisuals(shard, userId, roomName);
				if (visual) {
					return { visual };
				}
			}
		},
	];
});
