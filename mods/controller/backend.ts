import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { DowngradeTime, StructureController } from './controller';

bindMapRenderer(StructureController, () => 'c');

bindRenderer(StructureController, (controller, next) => ({
	...next(),
	level: controller.level,
	progress: controller.progress,
	downgradeTime: controller[DowngradeTime],
	safeMode: 0,
}));
