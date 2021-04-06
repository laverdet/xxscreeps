import type { Endpoint } from 'xxscreeps/backend';

export const VersionEndpoint: Endpoint = {
	path: '/api/version',

	execute() {
		return {
			ok: 1,
			protocol: 14,
			package: 160,
			useNativeAuth: false,
			serverData: {
				shards: [],
			},
		};
	},
};
