import { bindMapRenderer, bindRenderer, bindTerrainRenderer, hooks } from 'xxscreeps/backend';
import { userToIntentRoomsSetKey, userToPresenceRoomsSetKey } from 'xxscreeps/engine/processor/model';
import { StructureController } from './controller';
import { controlledRoomKey as controlledRoomsKey, reservedRoomKey as reservedRoomsKey } from './processor';

bindMapRenderer(StructureController, () => 'c');
bindTerrainRenderer(StructureController, () => 0x505050);

bindRenderer(StructureController, (controller, next) => {
	const reservationEndTime = controller['#reservationEndTime'];
	const sign = controller.room['#sign'];
	return {
		...next(),
		level: controller.level,
		progress: controller.progress,
		downgradeTime: controller['#downgradeTime'],
		safeMode: controller.room['#safeModeUntil'],
		safeModeAvailable: controller.safeModeAvailable,
		safeModeCooldown: controller['#safeModeCooldownTime'],
		...reservationEndTime ? {
			reservation: {
				endTime: reservationEndTime,
				user: controller.room['#user'],
			},
		} : undefined,
		...sign ? {
			sign: {
				datetime: sign.datetime,
				time: sign.time,
				text: sign.text,
				user: sign.userId,
			},
		} : undefined,
	};
});

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
