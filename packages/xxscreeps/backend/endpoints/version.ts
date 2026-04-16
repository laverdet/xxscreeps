import type { Endpoint } from 'xxscreeps/backend/index.js';
import config from 'xxscreeps/config/index.js';

export const VersionEndpoint: Endpoint = {
	path: '/api/version',

	execute() {
		return {
			ok: 1,
			protocol: 14,
			package: 160,
			useNativeAuth: false,
			users: 1,
			serverData: {
				features: [
					{ name: 'auth', version: 1 },
					{ name: 'official-like', version: 1 },
				],
				customObjectTypes: {},
				renderer: {
					resources: {},
					metadata: {},
				},
				shards: config.shards.map(shard => shard.name),
			},
			packageVersion: 'xxscreeps',
		};
	},
};
