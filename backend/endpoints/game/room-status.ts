import { Endpoint } from '~/backend/endpoint';

export const RoomStatusEndpoint: Endpoint = {
	method: 'get',
	path: '/room-status',

	execute(req) {
		return {
			ok: 1,
			room: {
				_id: req.query.room,
				status: 'normal',
				openTime: 0,
			},
		};
	},
};
