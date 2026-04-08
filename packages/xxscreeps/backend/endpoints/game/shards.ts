import { hooks } from 'xxscreeps/backend/index.js';
import config from 'xxscreeps/config/index.js';

hooks.register('route', {
	path: '/api/game/shards/info',
	execute() {
		return {
			ok: 1,
			shards: config.shards.map(shard => ({
				name: shard.name,
				lastTicks: [],
				cpuLimit: 0,
				rooms: 0,
				users: 0,
				tick: 0,
			})),
		};
	},
});
