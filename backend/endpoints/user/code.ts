import { Endpoint } from '~/backend/endpoint';

export const CodeEndpoint: Endpoint = {
	path: '/code',

	execute() {
		return {
			ok: 1,
			branch: 'master',
			modules: {},
		};
	},
};
