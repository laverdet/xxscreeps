import { Endpoint } from '~/backend/endpoint';

export const VersionEndpoint: Endpoint = {
	path: '/version',

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
