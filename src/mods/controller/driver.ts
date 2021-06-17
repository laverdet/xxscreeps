import * as Fn from 'xxscreeps/utility/functional';
import * as RoomSchema from 'xxscreeps/engine/db/room';
import * as User from 'xxscreeps/engine/db/user';
import { hooks } from 'xxscreeps/driver';
import { controlledRoomCountKey } from './processor';

declare module 'xxscreeps/driver' {
	interface TickPayload {
		controlledRoomCount: number;
		gcl: number;
	}
	interface TickResult {
		controllerActivity: number;
	}
}

hooks.register('driverConnector', player => {
	const { shard, userId } = player;
	let gcl = NaN;
	let roomCount = NaN;
	let shouldCheckGcl = true;
	let shouldCheckRooms = true;
	return [ undefined, {
		async refresh(payload) {
			if (shouldCheckRooms) {
				roomCount = Fn.accumulate(await payload.roomBlobsPromise, blob => {
					const room = RoomSchema.read(blob);
					return room['#user'] === userId && room['#level'] > 0 ? 1 : 0;
				});
				await shard.scratch.set(controlledRoomCountKey(userId), roomCount);
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
