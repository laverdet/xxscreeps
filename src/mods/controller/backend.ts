import { bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { StructureController } from './controller';

bindTerrainRenderer(StructureController, () => 0x505050);

bindRenderer(StructureController, (controller, next) => ({
	...next(),
	level: controller.level,
	progress: controller.progress,
	downgradeTime: controller['#downgradeTime'],
	safeMode: 0,
	...controller['#sign'] ? {
		sign: {
			datetime: controller['#sign'].datetime,
			text: controller['#sign'].text,
			time: controller['#sign'].time,
			user: controller['#sign'].userId,
		},
	} : undefined,
}));
