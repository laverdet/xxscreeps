import { Endpoint } from '~/backend/endpoint';

export const CodeEndpoint: Endpoint = {
	method: 'get',
	path: '/code',

	execute() {
		return {
			ok: 1,
			branch: 'master',
			modules: {},
		};
	},
};
