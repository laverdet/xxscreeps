import { Endpoint } from '~/backend/endpoint';
import * as User from '~/engine/metadata/user';

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
		const { userid } = req;
		if (userid === undefined) {
			return { ok: 1 };
		}
		const user = User.read(await this.context.blobStorage.load(`user/${userid}/info`));
		return {
			ok: 1,
			status: user.active ? 'normal' : 'empty',
		};
	},
};

export default [ RespawnProhibitedRoomsEndpoint, WorldStartRoomEndpoint, WorldStatusEndpoint ];
