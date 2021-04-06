import type { Endpoint } from 'xxscreeps/backend';

export const RoomStatusEndpoint: Endpoint = {
	path: '/api/game/room-status',

	execute(context) {
		return {
			ok: 1,
			room: {
				_id: context.query.room,
				status: 'normal',
				openTime: 0,
			},
		};
	},
};
