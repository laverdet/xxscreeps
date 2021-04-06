import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import { extend } from 'xxscreeps/utility/utility';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks';
import { Creep, checkCommon, checkResource } from 'xxscreeps/mods/creep/creep';
import { StructureController } from './controller';

// Creep extension declaration
declare module 'xxscreeps/mods/creep/creep' {
	interface Creep {
		/**
		 * Upgrade your controller to the next level using carried energy. Upgrading controllers raises
		 * your Global Control Level in parallel. Requires `WORK` and `CARRY` body parts. The target has
		 * to be within 3 squares range of the creep.
		 *
		 * A fully upgraded level 8 controller can't be upgraded over 15 energy units per tick
		 * regardless of creeps abilities. The cumulative effect of all the creeps performing
		 * `upgradeController` in thecurrent tick is taken into account. This limit can be increased by
		 * using ghodium mineral boost.
		 *
		 * Upgrading the controller raises its `ticksToDowngrade` timer by 100. The timer must be
		 * full in order for controller to be levelled up.
		 * @param target The target controller object to be upgraded
		 */
		upgradeController(target: StructureController): ReturnType<typeof checkUpgradeController>;
	}
}

// Creep extension implementation
extend(Creep, {
	upgradeController(target) {
		return chainIntentChecks(
			() => checkUpgradeController(this, target),
			() => Game.intents.save(this, 'upgradeController', target.id),
		);
	},
});

// Intent checker
export function checkUpgradeController(creep: Creep, target: StructureController) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkResource(creep),
		() => checkTarget(target, StructureController),
		() => checkRange(creep, target, 3),
		() => {
			if (target.upgradeBlocked) {
				return C.ERR_INVALID_TARGET;
			} else if (!target.my) {
				return C.ERR_NOT_OWNER;
			}
			return C.OK;
		});
}
