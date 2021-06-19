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

const WorldStatusEndpoint: Endpoint = {
	path: '/api/user/world-status',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return { ok: 1, status: 'normal' };
		}
		const active = await context.shard.data.sismember('activeUsers', userId);
		if (active) {
			return { ok: 1, status: 'normal' };
		} else {
			return { ok: 1, status: 'empty' };
		}
		// return { ok: 1, status: 'lost' };
	},
};

export default [ RespawnProhibitedRoomsEndpoint, WorldStartRoomEndpoint, WorldStatusEndpoint ];
