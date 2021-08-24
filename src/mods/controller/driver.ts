import * as User from 'xxscreeps/engine/db/user';
import { hooks } from 'xxscreeps/engine/runner';
import { hooks as processorHooks } from 'xxscreeps/engine/processor';
import { controlledRoomKey, reservedRoomKey } from './processor';

declare module 'xxscreeps/engine/runner' {
	interface TickPayload {
		controlledRoomCount: number;
		gcl: number;
	}
}

processorHooks.register('refreshRoom', async(shard, room) => {
	const userId = room['#user'];
	if (userId != null) {
		const key = room['#level'] === 0 ? reservedRoomKey(userId) : controlledRoomKey(userId);
		await shard.scratch.sadd(key, [ room.name ]);
	}
});

hooks.register('runnerConnector', player => {
	const { shard, userId } = player;
	return [ undefined, {
		async refresh(payload) {
			[
				payload.controlledRoomCount,
				payload.gcl,
			] = await Promise.all([
				shard.scratch.scard(controlledRoomKey(userId)),
				async function() {
					return Number(await shard.db.data.hget(User.infoKey(userId), 'gcl')) || 0;
				}(),
			]);
		},
	} ];
});
