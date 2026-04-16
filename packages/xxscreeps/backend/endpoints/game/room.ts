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
		return {
			ok: 1,
			room: {
				_id: context.query.room,
				status: 'normal',
				openTime: 0,
			},
		};
	},
});
