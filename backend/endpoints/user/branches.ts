import { Endpoint } from '~/backend/endpoint';

export const BranchesEndpoint: Endpoint = {
	method: 'get',
	path: '/branches',

	execute() {
		return {
			ok: 1,
			list: [],
		};
	},
};
