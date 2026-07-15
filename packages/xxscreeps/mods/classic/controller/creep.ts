import { chainIntentChecks, checkRange, checkSafeMode, checkString, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { intents, me, userGame } from 'xxscreeps/game/index.js';
import { Creep, checkCommon } from 'xxscreeps/mods/classic/creep/creep.js';
import { checkHasResource } from 'xxscreeps/mods/classic/resource/store.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { StructureController } from './controller.js';

// Creep extension declaration
declare module 'xxscreeps/mods/classic/creep/creep.js' {
	interface Creep {
		/**
		 * Decreases the controller's downgrade timer by 300 ticks per every `CLAIM` body part, or
		 * reservation timer by 1 tick per every `CLAIM` body part. If the controller under attack is
		 * owned, it cannot be upgraded or attacked again for the next 1,000 ticks. The target has to be
		 * at adjacent square to the creep.
		 * @param target The target controller object.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`, `ERR_TIRED`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.attackController
		 */
		attackController: (target: StructureController) => ReturnType<typeof checkAttackController>;

		/**
		 * Claims a neutral controller under your control. Requires the `CLAIM` body part. The target
		 * has to be at adjacent square to the creep. You need to have the corresponding Global Control
		 * Level in order to claim a new room. If you don't have enough GCL, consider
		 * [reserving](https://docs.screeps.com/api/#Creep.reserveController) this room instead.
		 * [Learn more](https://docs.screeps.com/control.html#Global-Control-Level)
		 * @param target The target controller object.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_FULL`, `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`, `ERR_GCL_NOT_ENOUGH`, `ERR_ACCESS_DENIED`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.claimController
		 */
		claimController: (target: StructureController) => ReturnType<typeof checkClaimController>;

		/**
		 * Add one more available safe mode activation to a room controller. The creep has to be at
		 * adjacent square to the target room controller and have 1000 ghodium resource.
		 * @param target The target room controller.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
		 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`, `ERR_NOT_IN_RANGE`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.generateSafeMode
		 */
		generateSafeMode: (target: StructureController) => ReturnType<typeof checkGenerateSafeMode>;

		/**
		 * Temporarily block a neutral controller from claiming by other players and restore energy
		 * sources to their full capacity. Each tick, this command increases the counter of the period
		 * during which the controller is unavailable by 1 tick per each `CLAIM` body part. The maximum
		 * reservation period to maintain is 5,000 ticks. The target has to be at adjacent square to the
		 * creep.
		 * @param target The target controller object to be reserved.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`, `ERR_ACCESS_DENIED`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.reserveController
		 */
		reserveController: (target: StructureController) => ReturnType<typeof checkReserveController>;

		/**
		 * Sign a controller with an arbitrary text visible to all players. This text will appear in the
		 * room UI, in the world map, and can be accessed via the API. You can sign unowned and hostile
		 * controllers. The target has to be at adjacent square to the creep. Pass an empty string to
		 * remove the sign.
		 * @param target The target controller object to be signed.
		 * @param message The sign text. The string is cut off after 100 characters.
		 * @returns One of the following codes: `OK`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_NOT_IN_RANGE`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.signController
		 */
		signController: (target: StructureController, message: string) => ReturnType<typeof checkSignController>;

		/**
		 * Upgrade your controller to the next level using carried energy. Upgrading controllers raises
		 * your Global Control Level in parallel. Requires `WORK` and `CARRY` body parts. The target has
		 * to be within 3 squares range of the creep.
		 *
		 * A fully upgraded level 8 controller can't be upgraded over 15 energy units per tick
		 * regardless of creeps abilities. The cumulative effect of all the creeps performing
		 * `upgradeController` in the current tick is taken into account. This limit can be increased by
		 * using [ghodium mineral boost](https://docs.screeps.com/resources.html).
		 *
		 * Upgrading the controller raises its `ticksToDowngrade` timer by 100. The timer must be full
		 * in order for controller to be levelled up.
		 * @param target The target controller object to be upgraded.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
		 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`, `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`,
		 * `ERR_ACCESS_DENIED`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.upgradeController
		 */
		upgradeController: (target: StructureController) => ReturnType<typeof checkUpgradeController>;
	}
}

// Creep extension implementation
extend(Creep, {
	attackController(target) {
		return chainIntentChecks(
			() => checkAttackController(this, target),
			() => intents.save(this, 'attackController', target.id));
	},

	claimController(target) {
		return chainIntentChecks(
			() => checkClaimController(this, target),
			() => intents.save(this, 'claimController', target.id));
	},

	generateSafeMode(target) {
		return chainIntentChecks(
			() => checkGenerateSafeMode(this, target),
			() => intents.save(this, 'generateSafeMode', target.id));
	},

	reserveController(target) {
		return chainIntentChecks(
			() => checkReserveController(this, target),
			() => intents.save(this, 'reserveController', target.id));
	},

	signController(target, message) {
		return chainIntentChecks(
			() => checkSignController(this, target, message),
			() => intents.save(this, 'signController', target.id, message));
	},

	upgradeController(target) {
		return chainIntentChecks(
			() => checkUpgradeController(this, target),
			() => intents.save(this, 'upgradeController', target.id));
	},
});

// Intent checkers
function checkClaimPart(creep: Creep) {
	return creep.getActiveBodyparts(C.CLAIM) > 0 ? C.OK : C.ERR_NO_BODYPART;
}

export function checkAttackController(creep: Creep, target: StructureController) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkTarget(target, StructureController),
		() => checkClaimPart(creep),
		() => checkRange(creep, target, 1),
		() => checkSafeMode(target.room, C.ERR_NO_BODYPART),
		() => {
			// Owned controllers use #user; reserved controllers only set room #user
			if (target['#user'] === null && !target['#reservationEndTime']) {
				return C.ERR_INVALID_TARGET;
			} else if (target.upgradeBlocked) {
				return C.ERR_TIRED;
			}
		});
}

export function checkClaimController(creep: Creep, target: StructureController) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => {
			if (userGame && userGame.gcl.level <= userGame.gcl['#roomCount']) {
				return C.ERR_GCL_NOT_ENOUGH;
			}
		},
		() => checkTarget(target, StructureController),
		() => checkClaimPart(creep),
		() => checkRange(creep, target, 1),
		() => {
			const user = target['#user'];
			if (user !== null) {
				return C.ERR_INVALID_TARGET;
			}
			const roomOwner = target.room['#user'];
			if (roomOwner && roomOwner !== creep['#user']) {
				// Someone else reserved the controller
				return C.ERR_INVALID_TARGET;
			}
			return C.OK;
		});
}

export function checkGenerateSafeMode(creep: Creep, target: StructureController) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkHasResource(creep, C.RESOURCE_GHODIUM, C.SAFE_MODE_COST),
		() => checkTarget(target, StructureController),
		() => checkRange(creep, target, 1));
}

export function checkReserveController(creep: Creep, target: StructureController) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkTarget(target, StructureController),
		() => checkRange(creep, target, 1),
		() => {
			const user = target['#user'];
			const roomUser = target.room['#user'];
			if ((user !== null && user !== me) || (roomUser !== null && roomUser !== me) || target.level !== 0) {
				return C.ERR_INVALID_TARGET;
			}
		},
		() => checkClaimPart(creep));
}

export function checkSignController(creep: Creep, target: StructureController, message: string | null | undefined) {
	return chainIntentChecks(
		() => checkCommon(creep),
		() => checkTarget(target, Structure),
		() => checkRange(creep, target, 1),
		() => target instanceof StructureController ? C.OK : C.ERR_INVALID_TARGET,
		() => message ? checkString(message, 100) : C.OK);
}

export function checkUpgradeController(creep: Creep, target: StructureController) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkHasResource(creep, C.RESOURCE_ENERGY),
		() => checkTarget(target, StructureController),
		() => target.upgradeBlocked ? C.ERR_INVALID_TARGET : C.OK,
		() => checkRange(creep, target, 3),
		() => target.my ? C.OK : C.ERR_NOT_OWNER);
}
