import { hooks } from 'xxscreeps/backend/index.js';
import { config } from 'xxscreeps/config/index.js';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { disposableToEffect, throttle } from 'xxscreeps/utility/utility.js';
import { getVisualChannel, loadVisuals } from './model.js';

hooks.register('roomSocket', async (shard, userId, roomName) => {
	if (userId == null) {
		return;
	}

	// Subscribe to visuals channel and listen for publishes to this room
	let lastTime = shard.time;
	const unlisten = await getVisualChannel(shard, userId).listen(message => {
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
		using disposable = new DisposableStack();
		const { user } = params;
		const { shard } = this.context;
		if (this.user == null || user !== this.user) {
			return () => {};
		}

		let lastTime = shard.time;
		const check = throttle(() => mustNotReject(async () => {
			const visual = await loadVisuals(shard, user, 'map');
			this.send(JSON.stringify(visual));
		}));

		// Subscribe to visuals channel and listen for map publishes
		disposable.defer(await getVisualChannel(shard, user).listen(message => {
			if (message.type === 'publish') {
				if (message.roomNames.includes('map')) {
					lastTime = message.time;
				}
			}
		}));

		// Subscribe to game tick updates
		disposable.defer(shard.channel.listen(message => {
			if (message.type === 'tick' && message.time >= lastTime) {
				check.set(config.backend.socketThrottle);
			}
		}));
		disposable.defer(() => check.clear());

		return disposableToEffect(disposable.move());
	},
});
