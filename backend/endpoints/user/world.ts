import { Endpoint } from '~/backend/endpoint';

const RespawnProhibitedRoomsEndpoint: Endpoint = {
	path: '/respawn-prohibited-rooms',

	execute() {
		return {
			ok: 1,
			rooms: [],
		};
	},
};

const WorldStartRoomEndpoint: Endpoint = {
	path: '/world-start-room',

	execute() {
		return {
			ok: 1,
			room: [ 'W0N0' ],
		};
	},
};

const WorldStatusEndpoint: Endpoint = {
	path: '/world-status',

	execute() {
		return {
			ok: 1,
			status: 'normal',
		};
	},
};

export default [ RespawnProhibitedRoomsEndpoint, WorldStartRoomEndpoint, WorldStatusEndpoint ];
