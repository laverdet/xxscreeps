import { hooks } from 'xxscreeps/backend/index.js';

hooks.register('route', {
	path: '/api/game/room-decorations',

	execute() {
		return {
			ok: 1,
			decorations: [],
		};
	},
});

hooks.register('route', {
	path: '/api/game/room-status',

	execute(context) {
		const roomName = context.query.room;
		if (typeof roomName !== 'string') {
			return;
		}
		const status = context.backend.world.map.getRoomStatus(roomName);
		if (!status) {
			return;
		}
		return {
			ok: 1,
			room: {
				_id: roomName,
				status: status.status,
				openTime: 0,
			},
		};
	},
});
