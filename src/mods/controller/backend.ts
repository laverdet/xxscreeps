import { bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { DowngradeTime, StructureController } from './controller';

bindTerrainRenderer(StructureController, () => 0x505050);

bindRenderer(StructureController, (controller, next) => ({
	...next(),
	level: controller.level,
	progress: controller.progress,
	downgradeTime: controller[DowngradeTime],
	safeMode: 0,
}));
