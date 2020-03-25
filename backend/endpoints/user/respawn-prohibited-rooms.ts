import { Endpoint } from '~/backend/endpoint';

export const RespawnProhibitedRoomsEndpoint: Endpoint = {
	method: 'get',
	path: '/respawn-prohibited-rooms',

	execute() {
		return {
			ok: 1,
			rooms: [],
		};
	},
};
