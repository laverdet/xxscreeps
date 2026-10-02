import { untilTime } from 'xxscreeps/game/object.js';
import { StructureFactory } from 'xxscreeps/mods/modern/factory/factory.js';
import * as C from 'xxscreeps:mods/constants';
import 'xxscreeps/mods/modern/effects/game.js';

// The factory declares and reads the operated window; the power id that fills out the entry is
// this mod's, so it contributes the derived view.
StructureFactory.prototype['#effects'] = function(effects) {
	return function*(this: StructureFactory) {
		yield* effects.apply(this);
		const operator = this['#operator'];
		const ticksRemaining = untilTime(operator.endTime);
		if (ticksRemaining !== undefined) {
			yield {
				effect: C.PWR_OPERATE_FACTORY,
				power: C.PWR_OPERATE_FACTORY,
				level: operator.level,
				ticksRemaining,
			};
		}
	};
}(StructureFactory.prototype['#effects']);
