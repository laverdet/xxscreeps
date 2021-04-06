import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import { extend } from 'xxscreeps/utility/utility';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { Creep, checkCommon } from 'xxscreeps/mods/creep/creep';
import { Harvestable, HarvestResult } from './game';
import { CheckHarvest } from './symbols';

// `harvest` intent check
export function checkHarvest(creep: Creep, target: Harvestable | undefined) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => target ? target[CheckHarvest](creep) : C.ERR_INVALID_TARGET,
	) as HarvestResult;
}

declare module 'xxscreeps/mods/creep/creep' {
	interface Creep {
		/**
		 * Harvest energy from the source or resources from minerals and deposits. Requires the WORK
		 * body part. If the creep has an empty CARRY body part, the harvested resource is put into it;
		 * otherwise it is dropped on the ground. The target has to be at an adjacent square to the
		 * creep.
		 * @param target The object to be harvested
		 */
		harvest(target: Harvestable): HarvestResult;
	}
}

extend(Creep, {
	harvest(target) {
		return chainIntentChecks(
			() => checkHarvest(this, target),
			() => Game.intents.save(this, 'harvest', target.id));
	},
});
