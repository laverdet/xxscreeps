import { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';

interface CreateInvaderRequest {
	room: string;
	x: number;
	y: number;
	size: string;
	type: string;
}

const createInvaderRequestSchema: JSONSchemaType<CreateInvaderRequest> = {
	type: 'object',
	properties: {
		room: { type: 'string' },
		x: { type: 'number' },
		y: { type: 'number' },
		size: { type: 'string' },
		type: { type: 'string' },
	},
	required: [ 'room', 'x', 'y', 'size', 'type' ],
};

hooks.register('route', {
	path: '/api/game/create-invader',
	method: 'post',

	execute: makeValidatedPayloadRoute(createInvaderRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const { room: roomName, x, y, size, type: rawType } = context.request.body;
		const type = rawType.toLowerCase();

		// Sanity check
		const pos = new RoomPosition(x, y, roomName);
		if (
			(size !== 'big' && size !== 'small') ||
			![ 'healer', 'melee', 'ranged' ].includes(type)
		) {
			return;
		}

		// Room state check
		const room = await context.shard.loadRoom(pos.roomName);
		if (room['#user'] !== userId) {
			throw new Error('Not room owner');
		}
		const creeps = room.find(C.FIND_CREEPS);
		if (creeps.filter(creep => creep['#user'] === '2').length >= 5) {
			throw new Error('Too many invaders');
		} else if (creeps.some(creep => creep['#user'] !== userId && creep['#user'] !== '2')) {
			throw new Error('Hostile creeps exist');
		}

		// Send the intent off to the processor
		await pushIntentsForRoomNextTick(context.shard, pos.roomName, userId, {
			local: { requestInvader: [ [ pos.x, pos.y, type, size ] ] },
			internal: true,
		});

		return { ok: 1 };
	}),
});
