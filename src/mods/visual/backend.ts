import config from 'xxscreeps/config/index.js';
import { hooks } from 'xxscreeps/backend/index.js';
import { acquire, mustNotReject } from 'xxscreeps/utility/async.js';
import { throttle } from 'xxscreeps/utility/utility.js';
import { getVisualChannel, loadVisuals } from './model.js';

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

	async subscribe(params) {
		const { user } = params;
		const { shard } = this.context;
		if (!this.user || user !== this.user) {
			return () => {};
		}

		let lastTime = shard.time;
		const check = throttle(() => mustNotReject(async() => {
			const visual = await loadVisuals(shard, user, 'map');
			this.send(JSON.stringify(visual));
		}));

		const [ effect ] = await acquire(
			// Subscribe to visuals channel and listen for map publishes
			function() {
				return getVisualChannel(shard, user).listen<true>(message => {
					if (message.type === 'publish') {
						if (message.roomNames.includes('map')) {
							lastTime = message.time;
						}
					}
				});
			}(),
			function() {
				// Subscribe to game tick updates
				return shard.channel.listen(message => {
					if (message.type === 'tick' && message.time >= lastTime) {
						check.set(config.backend.socketThrottle);
					}
				});
			}(),
			() => check.clear(),
		);
		return effect;
	},
});
