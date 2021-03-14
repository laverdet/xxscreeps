import * as Game from 'xxscreeps/game';
import { extend } from 'xxscreeps/utility/utility';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { Creep, checkCommon } from 'xxscreeps/mods/creep/creep';
import { CheckHarvest, Harvestable, HarvestResult } from './game';

// `harvest` intent check
export function checkHarvest(creep: Creep, target: Harvestable) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => target[CheckHarvest](creep),
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
