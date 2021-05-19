import { bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { StructureController } from './controller';

bindTerrainRenderer(StructureController, () => 0x505050);

bindRenderer(StructureController, (controller, next) => ({
	...next(),
	level: controller.level,
	progress: controller.progress,
	downgradeTime: controller['#downgradeTime'],
	safeMode: 0,
	...controller.room['#sign'] ? {
		sign: {
			datetime: controller.room['#sign'].datetime,
			text: controller.room['#sign'].text,
			time: controller.room['#sign'].time,
			user: controller.room['#sign'].userId,
		},
	} : undefined,
}));
