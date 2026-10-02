import { bindRenderer } from 'xxscreeps/backend/index.js';
import { StructureFactory } from 'xxscreeps/mods/modern/factory/factory.js';
import * as C from 'xxscreeps:mods/constants';

// Layered over the factory mod's own renderer, which knows the window but not the power filling it.
bindRenderer(StructureFactory, (factory, next) => {
	const { endTime, level } = factory['#operator'];
	return {
		...next(),
		...endTime > 0 && {
			effects: [ {
				effect: C.PWR_OPERATE_FACTORY,
				power: C.PWR_OPERATE_FACTORY,
				level,
				endTime,
			} ],
		},
	};
});
