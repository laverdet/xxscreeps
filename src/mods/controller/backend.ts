import { bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { DowngradeTime, StructureController } from './controller';

bindTerrainRenderer(StructureController, () => 0x505050);

bindRenderer(StructureController, (controller, next) => ({
	...next(),
	level: controller.level,
	progress: controller.progress,
	downgradeTime: controller[DowngradeTime],
	safeMode: 0,
	...controller._sign ? {
		sign: {
			datetime: controller._sign.datetime,
			text: controller._sign.text,
			time: controller._sign.time,
			user: controller._sign.userId,
		},
	} : undefined,
}));
