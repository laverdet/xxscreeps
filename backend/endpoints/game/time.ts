import { Endpoint } from '~/backend/endpoint';

export const TimeEndpoint: Endpoint = {
	method: 'get',
	path: '/time',

	execute() {
		return {
			ok: 1,
			time: 1,
		};
	},
};
