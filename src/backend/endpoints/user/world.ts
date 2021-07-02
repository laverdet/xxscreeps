import type { Endpoint } from 'xxscreeps/backend';

const RespawnProhibitedRoomsEndpoint: Endpoint = {
	path: '/api/user/respawn-prohibited-rooms',

	execute() {
		return {
			ok: 1,
			rooms: [],
		};
	},
};

const WorldStartRoomEndpoint: Endpoint = {
	path: '/api/user/world-start-room',

	execute() {
		return {
			ok: 1,
			room: [ 'W5N5' ],
		};
	},
};

export default [ RespawnProhibitedRoomsEndpoint, WorldStartRoomEndpoint ];
