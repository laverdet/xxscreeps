import type { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';

// The `/api/game/room-decorations` endpoint lives in the `decorations` mod.

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
