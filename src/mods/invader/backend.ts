import C from 'xxscreeps/game/constants/index.js';
import { hooks } from 'xxscreeps/backend/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';

hooks.register('route', {
	path: '/api/game/create-invader',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		const { room: roomName, x, y, size } = context.request.body;
		const type = context.request.body.type?.toLowerCase();
		if (!userId) {
			return;
		}

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
	},
});
