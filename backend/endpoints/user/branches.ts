import { Endpoint } from '~/backend/endpoint';

export const BranchesEndpoint: Endpoint = {
	path: '/branches',

	execute() {
		return {
			ok: 1,
			list: [],
		};
	},
};
