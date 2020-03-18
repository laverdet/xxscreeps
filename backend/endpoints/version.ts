import { Endpoint } from '~/backend/endpoint';

export const VersionEndpoint: Endpoint = {
	method: 'get',
	path: '/version',

	execute() {
		return {
			ok: 1,
			protocol: 14,
			package: 160,
			useNativeAuth: false,
		};
	},
};
