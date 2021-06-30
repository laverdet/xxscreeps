import * as User from 'xxscreeps/engine/db/user';
import { hooks } from 'xxscreeps/engine/runner';
import { hooks as processorHooks } from 'xxscreeps/engine/processor';
import { controlledRoomKey, reservedRoomKey } from './processor';

declare module 'xxscreeps/engine/runner' {
	interface TickPayload {
		controlledRoomCount: number;
		gcl: number;
	}
	interface TickResult {
		controllerActivity: number;
	}
}

processorHooks.register('refreshRoom', async(shard, room) => {
	const userId = room['#user'];
	if (userId !== null) {
		const key = room['#level'] === 0 ? reservedRoomKey(userId) : controlledRoomKey(userId);
		await shard.scratch.sadd(key, [ room.name ]);
	}
});

hooks.register('runnerConnector', player => {
	const { shard, userId } = player;
	let gcl = NaN;
	let roomCount = NaN;
	let shouldCheckGcl = true;
	let shouldCheckRooms = true;
	return [ undefined, {
		async refresh(payload) {
			if (shouldCheckRooms) {
				roomCount = await shard.scratch.scard(controlledRoomKey(userId));
			}
			payload.controlledRoomCount = roomCount;
			if (shouldCheckGcl) {
				gcl = Number(await shard.db.data.hget(User.infoKey(userId), 'gcl')) || 0;
			}
			payload.gcl = gcl;
		},

		save(payload) {
			shouldCheckGcl = Boolean(payload.controllerActivity & 1);
			shouldCheckRooms = Boolean(payload.controllerActivity & 2);
		},
	} ];
});
