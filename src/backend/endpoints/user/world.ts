import type { Endpoint } from 'xxscreeps/backend';
import { loadUser } from 'xxscreeps/backend/model/user';

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
		const user = userId && await loadUser(context.backend, userId).catch(() => {});
		if (!user) {
			return { ok: 1, status: 'normal' };
		} else if (user.roomsControlled.size === 0) {
			if (user.roomsPresent.size === 0) {
				return { ok: 1, status: 'empty' };
			} else {
				return { ok: 1, status: 'lost' };
			}
		} else {
			return { ok: 1, status: 'normal' };
		}
	},
};

export default [ RespawnProhibitedRoomsEndpoint, WorldStartRoomEndpoint, WorldStatusEndpoint ];
