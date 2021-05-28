import { bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { StructureController } from './controller';

bindTerrainRenderer(StructureController, () => 0x505050);

bindRenderer(StructureController, (controller, next) => {
	const reservationTime = controller['#reservationTime'];
	const sign = controller.room['#sign'];
	return {
		...next(),
		level: controller.level,
		progress: controller.progress,
		downgradeTime: controller['#downgradeTime'],
		safeMode: 0,
		...reservationTime ? {
			endTime: reservationTime,
			user: controller.room['#user'],
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
