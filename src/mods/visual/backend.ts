import { hooks } from 'xxscreeps/backend';
import config from 'xxscreeps/config';
import { mustNotReject } from 'xxscreeps/utility/async';
import { throttle } from 'xxscreeps/utility/utility';
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

hooks.register('subscription', {
	pattern: /^mapVisual:(?<user>[^/]+)\/(?<shard>[^/]+)$/,

	subscribe(params) {
		const { user } = params;
		const { shard } = this.context;
		if (!this.user || user !== this.user) {
			return () => {};
		}

		const check = throttle(() => mustNotReject(async() => {
			const visual = await loadVisuals(shard, user, 'map');
			this.send(JSON.stringify(visual));
		}));
		// Subscribe to game tick updates
		const subscription = this.context.shard.channel.listen(() => check.set(config.backend.socketThrottle));
		return () => {
			subscription();
			check.clear();
		};
	},
});
