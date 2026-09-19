import { powerDuration } from 'xxscreeps/mods/mmo/powercreep/powercreep.js';
import { registerPowerProcessor } from 'xxscreeps/mods/mmo/powercreep/processor.js';
import { StructureFactory } from 'xxscreeps/mods/modern/factory/factory.js';
import * as C from 'xxscreeps:mods/constants';

registerPowerProcessor(C.PWR_OPERATE_FACTORY, (_creep, context, info, level, target) => {
	if (!(target instanceof StructureFactory)) {
		return false;
	}
	// The first operator to reach a fresh factory fixes its level permanently.
	if (target['#level'] === 0) {
		target['#level'] = level;
	} else if (target['#level'] !== level) {
		return false;
	}
	const operator = target['#operator'];
	operator.endTime = context.time + powerDuration(info, level);
	operator.level = level;
	return true;
});
