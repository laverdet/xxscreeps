import { Endpoint } from 'xxscreeps/backend/endpoint';
import { loadUser } from 'xxscreeps/backend/model/user';

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
			room: [ 'W5N5' ],
		};
	},
};

const WorldStatusEndpoint: Endpoint = {
	path: '/world-status',

	async execute(req) {
		const { userid } = req.locals;
		const user = userid && await loadUser(this.context, userid).catch(() => {});
		if (!user) {
			return { ok: 1, status: 'empty' };
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
