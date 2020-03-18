import { Endpoint } from '~/backend/endpoint';

export const WorldStatusEndpoint: Endpoint = {
	method: 'get',
	path: '/world-status',

	execute() {
		return {
			ok: 1,
			status: 'lost',
		};
	},
};
