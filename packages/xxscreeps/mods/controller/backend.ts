import { hooks } from 'xxscreeps/backend/index.js';
import { userToIntentRoomsSetKey, userToPresenceRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { controlledRoomKey as controlledRoomsKey, reservedRoomKey as reservedRoomsKey } from './processor.js';

hooks.register('route', {
	path: '/api/user/rooms',
	async execute(context) {
		const { shard } = context;
		const userId = context.query.id as string;
		const [ controlled, reserved ] = await Promise.all([
			shard.scratch.smembers(controlledRoomsKey(userId)),
			shard.scratch.smembers(reservedRoomsKey(userId)),
		]);
		return {
			ok: 1,
			shards: {
				[shard.name]: controlled,
			},
			reservations: {
				[shard.name]: reserved,
			},
		};
	},
});

hooks.register('route', {
	path: '/api/user/world-status',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return { ok: 1, status: 'normal' };
		}
		const [ controlled, intents, presence ] = await Promise.all([
			context.shard.scratch.scard(controlledRoomsKey(userId)),
			context.shard.scratch.scard(userToIntentRoomsSetKey(userId)),
			context.shard.scratch.scard(userToPresenceRoomsSetKey(userId)),
		]);
		if (presence > 0) {
			if (intents > 0 && controlled > 0) {
				return { ok: 1, status: 'normal' };
			} else {
				return { ok: 1, status: 'lost' };
			}
		} else {
			return { ok: 1, status: 'empty' };
		}
	},
});
