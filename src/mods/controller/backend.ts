import config from 'xxscreeps/config';
import { bindMapRenderer, bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { StructureController } from './controller';

if (config.backend.socketSkipsPermanents) {
	bindTerrainRenderer(StructureController, () => 0x505050);
} else {
	bindMapRenderer(StructureController, () => 'c');
}

bindRenderer(StructureController, (controller, next) => {
	const reservationTime = controller['#reservationTime'];
	const sign = controller.room['#sign'];
	return {
		...next(),
		level: controller.level,
		progress: controller.progress,
		downgradeTime: controller['#downgradeTime'],
		safeMode: controller.safeMode,
		safeModeAvailable: controller.safeModeAvailable,
		safeModeCooldown: controller.safeModeCooldown,
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
