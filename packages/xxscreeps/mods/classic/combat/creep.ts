import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { intents } from 'xxscreeps/game/index.js';
import { captureDamage } from 'xxscreeps/game/processor.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Creep, calculatePower, checkCommon } from 'xxscreeps/mods/classic/creep/creep.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { extend } from 'xxscreeps/utility/utility.js';

// Creep extension declaration
declare module 'xxscreeps/mods/classic/creep/creep.js' {
	interface Creep {
		/**
		 * Attack another creep, power creep, or structure in a short-ranged attack. Requires the
		 * `ATTACK` body part. If the target is inside a rampart, then the rampart is attacked instead.
		 * The target has to be at adjacent square to the creep. If the target is a creep with `ATTACK`
		 * body parts and is not inside a rampart, it will automatically hit back at the attacker.
		 * @param target The target object to be attacked.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.attack
		 */
		attack: (target: AttackTarget) => ReturnType<typeof checkAttack>;

		/**
		 * Heal self or another creep. It will restore the target creep’s damaged body parts function
		 * and increase the hits counter. Requires the `HEAL` body part. The target has to be at
		 * adjacent square to the creep.
		 * @param target The target creep object.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.heal
		 */
		heal: (target: Creep) => ReturnType<typeof checkHeal>;

		/**
		 * A ranged attack against another creep or structure. Requires the `RANGED_ATTACK` body part.
		 * If the target is inside a rampart, the rampart is attacked instead. The target has to be
		 * within 3 squares range of the creep.
		 * @param target The target object to be attacked.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.rangedAttack
		 */
		rangedAttack: (target: AttackTarget) => ReturnType<typeof checkRangedAttack>;

		/**
		 * Heal another creep at a distance. It will restore the target creep’s damaged body parts
		 * function and increase the hits counter. Requires the `HEAL` body part. The target has to be
		 * within 3 squares range of the creep.
		 * @param target The target creep object.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.rangedHeal
		 */
		rangedHeal: (target: Creep) => ReturnType<typeof checkRangedHeal>;

		/**
		 * A ranged attack against all hostile creeps or structures within 3 squares range. Requires the
		 * `RANGED_ATTACK` body part. The attack power depends on the range to each target. Friendly
		 * units are not affected.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_NO_BODYPART`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.rangedMassAttack
		 */
		rangedMassAttack: () => ReturnType<typeof checkRangedMassAttack>;
	}
}

// Creep extension implementation
extend(Creep, {
	attack(target) {
		return chainIntentChecks(
			() => checkAttack(this, target),
			() => intents.save(this, 'attack', target.id),
		);
	},

	rangedAttack(target) {
		return chainIntentChecks(
			() => checkRangedAttack(this, target),
			() => intents.save(this, 'rangedAttack', target.id),
		);
	},

	rangedMassAttack() {
		return chainIntentChecks(
			() => checkRangedMassAttack(this),
			() => intents.save(this, 'rangedMassAttack'),
		);
	},

	heal(target) {
		return chainIntentChecks(
			() => checkHeal(this, target),
			() => intents.save(this, 'heal', target.id),
		);
	},

	rangedHeal(target) {
		return chainIntentChecks(
			() => checkRangedHeal(this, target),
			() => intents.save(this, 'rangedHeal', target.id),
		);
	},
});

// Add counter attack
Creep.prototype['#applyDamage'] = function(applyDamage) {
	return function(this: Creep, power, type, source) {
		applyDamage.call(this, power, type, source);
		if (
			type === C.EVENT_ATTACK_TYPE_MELEE &&
				source instanceof Creep &&
				!this.room.controller?.safeMode
		) {
			const counterAttack = calculatePower(this, C.ATTACK, C.ATTACK_POWER, 'attack');
			if (counterAttack) {
				const damage = captureDamage(source, counterAttack, C.EVENT_ATTACK_TYPE_HIT_BACK, null);
				if (damage > 0) {
					appendEventLog(this.room, {
						event: C.EVENT_ATTACK,
						objectId: this.id,
						targetId: source.id,
						attackType: C.EVENT_ATTACK_TYPE_HIT_BACK,
						damage,
					});
					source['#applyDamage'](damage, C.EVENT_ATTACK_TYPE_HIT_BACK, this);
				}
			}
		}
	};
}(Creep.prototype['#applyDamage']);

// Intent checks
export type AttackTarget = Creep | Structure;
export function checkAttack(creep: Creep, target: AttackTarget) {
	return chainIntentChecks(
		() => checkCommon(creep, C.ATTACK),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep, Structure),
		() => checkDestructible(target),
		() => target['#invulnerable'] ? C.ERR_INVALID_TARGET : C.OK,
		() => checkRange(creep, target, 1),
	);
}

export function checkRangedAttack(creep: Creep, target: AttackTarget) {
	return chainIntentChecks(
		() => checkCommon(creep, C.RANGED_ATTACK),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep, Structure),
		() => checkDestructible(target),
		() => checkRange(creep, target, 3),
		() => target['#invulnerable'] ? C.ERR_INVALID_TARGET : C.OK,
	);
}

export function checkRangedMassAttack(creep: Creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.RANGED_ATTACK),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART));
}

export function checkHeal(creep: Creep, target: Creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.HEAL),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep),
		() => checkRange(creep, target, 1),
	);
}

export function checkRangedHeal(creep: Creep, target: Creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.HEAL),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep),
		() => checkDestructible(target),
		() => checkRange(creep, target, 3),
	);
}

export function checkDestructible(target: Creep | Structure) {
	if (target instanceof Creep && target.spawning) {
		return C.ERR_INVALID_TARGET;
	}
	return target.hits === undefined ? C.ERR_INVALID_TARGET : C.OK;
}
