import { bindMapRenderer, bindRenderer, bindTerrainRenderer, hooks } from 'xxscreeps/backend';
import { StructureController } from './controller';
import { controlledRoomKey, reservedRoomKey } from './processor';

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
			shard.scratch.smembers(controlledRoomKey(userId)),
			shard.scratch.smembers(reservedRoomKey(userId)),
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
