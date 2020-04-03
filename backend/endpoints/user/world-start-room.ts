import { Endpoint } from '~/backend/endpoint';

export const WorldStartRoomEndpoint: Endpoint = {
	path: '/world-start-room',

	execute() {
		return {
			ok: 1,
			room: [ 'W0N0' ],
		};
	},
};
