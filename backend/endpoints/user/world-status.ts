import { Endpoint } from '~/backend/endpoint';

export const WorldStatusEndpoint: Endpoint = {
	path: '/world-status',

	execute() {
		return {
			ok: 1,
			status: 'normal',
		};
	},
};
