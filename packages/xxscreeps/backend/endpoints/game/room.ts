import { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';

hooks.register('route', {
	path: '/api/game/room-decorations',

	execute() {
		return {
			ok: 1,
			decorations: [],
		};
	},
});

interface RoomStatusRequest {
	room: string;
}

const roomStatusSchema: JSONSchemaType<RoomStatusRequest> = {
	type: 'object',
	properties: {
		room: { type: 'string' },
	},
	required: [ 'room' ],
};

hooks.register('route', {
	path: '/api/game/room-status',

	execute: makeValidatedQueryRoute(roomStatusSchema, context => ({
		ok: 1,
		room: {
			_id: context.request.query.room,
			status: 'normal',
			openTime: 0,
		},
	})),
});
