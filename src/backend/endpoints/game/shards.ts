import { registerBackendRoute } from 'xxscreeps/backend';
import config from 'xxscreeps/config';

registerBackendRoute({
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
