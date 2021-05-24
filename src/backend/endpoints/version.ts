import type { Endpoint } from 'xxscreeps/backend';
import config from 'xxscreeps/config';

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
