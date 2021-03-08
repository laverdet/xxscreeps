import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { extend } from 'xxscreeps/util/utility';
import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks';
import { Creep, checkCommon } from 'xxscreeps/game/objects/creep';
import { Structure } from 'xxscreeps/game/objects/structures';

// Creep extension declaration
declare module 'xxscreeps/game/objects/creep' {
	interface Creep {
		/**
		 * Attack another creep, power creep, or structure in a short-ranged attack. Requires the
		 * `ATTACK` body part. If the target is inside a rampart, then the rampart is attacked instead.
		 * The target has to be at adjacent square to the creep. If the target is a creep with `ATTACK`
		 * body parts and is not inside a rampart, it will automatically hit back at the attacker.
		 * @param target The target object to be attacked
		 */
		attack(target: AttackTarget): ReturnType<typeof checkAttack>;

		/**
		 * Heal self or another creep. It will restore the target creep’s damaged body parts function
		 * and increase the hits counter. Requires the `HEAL` body part. The target has to be at
		 * adjacent square to the creep.
		 * @param target The target creep object
		 */
		heal(target: Creep): ReturnType<typeof checkHeal>;

		/**
		 * A ranged attack against another creep or structure. Requires the `RANGED_ATTACK` body part.
		 * If the target is inside a rampart, the rampart is attacked instead. The target has to be
		 * within 3 squares range of the creep.
		 * @param target The target object to be attacked
		 */
		rangedAttack(target: AttackTarget): ReturnType<typeof checkRangedAttack>;

		/**
		 * Heal another creep at a distance. It will restore the target creep’s damaged body parts
		 * function and increase the hits counter. Requires the `HEAL` body part. The target has to be
		 * within 3 squares range of the creep.
		 * @param target The target creep object
		 */
		rangedHeal(target: Creep): ReturnType<typeof checkRangedHeal>;

		/**
		 * A ranged attack against all hostile creeps or structures within 3 squares range. Requires the
		 * `RANGED_ATTACK` body part. The attack power depends on the range to each target. Friendly units
		 * are not affected.
		 */
		rangedMassAttack(): ReturnType<typeof checkRangedMassAttack>;
	}
}

// Creep extension implementation
extend(Creep, {
	attack(target) {
		return chainIntentChecks(
			() => checkAttack(this, target),
			() => Game.intents.save(this, 'attack', target.id),
		);
	},

	heal(target) {
		return chainIntentChecks(
			() => checkHeal(this, target),
			() => Game.intents.save(this, 'heal', target.id),
		);
	},

	rangedAttack(target) {
		return chainIntentChecks(
			() => checkRangedAttack(this, target),
			() => Game.intents.save(this, 'rangedAttack', target.id),
		);
	},

	rangedHeal(target) {
		return chainIntentChecks(
			() => checkRangedHeal(this, target),
			() => Game.intents.save(this, 'rangedHeal', target.id),
		);
	},

	rangedMassAttack() {
		return chainIntentChecks(
			() => checkRangedMassAttack(this),
			() => Game.intents.save(this, 'rangedMassAttack'),
		);
	},
});

// Intent checks
export type AttackTarget = Creep | Structure;
export function checkAttack(creep: Creep, target: AttackTarget) {
	return chainIntentChecks(
		() => checkCommon(creep, C.ATTACK),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep, Structure),
		() => checkRange(creep, target, 1),
	);
}

export function checkHeal(creep: Creep, target: Creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.HEAL),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep),
		() => checkRange(creep, target, 1),
	);
}

export function checkRangedAttack(creep: Creep, target: AttackTarget) {
	return chainIntentChecks(
		() => checkCommon(creep, C.RANGED_ATTACK),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep, Structure),
		() => checkRange(creep, target, 3),
	);
}

export function checkRangedHeal(creep: Creep, target: Creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.HEAL),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep),
		() => checkRange(creep, target, 3),
	);
}

export function checkRangedMassAttack(creep: Creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.RANGED_ATTACK),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART));
}
