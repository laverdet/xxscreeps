import type { RoomObject } from 'xxscreeps/game/object';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { intents } from 'xxscreeps/game';
import { extend } from 'xxscreeps/utility/utility';
import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks';
import { Creep, calculatePower, checkCommon } from 'xxscreeps/mods/creep/creep';
import { Structure } from 'xxscreeps/mods/structure/structure';

// Creep extension declaration
declare module 'xxscreeps/mods/creep/creep' {
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
const applyDamage = Creep.prototype['#applyDamage'];
Creep.prototype['#applyDamage'] = function(this: Creep, power, type, source) {
	applyDamage.call(this, power, type, source);
	if (
		type === C.EVENT_ATTACK_TYPE_MELEE &&
			source instanceof Creep &&
			!this.room.controller?.safeMode
	) {
		const counterAttack = calculatePower(this, C.ATTACK, C.ATTACK_POWER);
		if (counterAttack) {
			const damage = captureDamage(source, counterAttack, C.EVENT_ATTACK_TYPE_HIT_BACK);
			if (damage > 0) {
				source['#applyDamage'](damage, C.EVENT_ATTACK_TYPE_HIT_BACK, this);
			}
		}
	}
};

// Intent checks
export type AttackTarget = Creep | Structure;
export function checkAttack(creep: Creep, target: AttackTarget) {
	return chainIntentChecks(
		() => checkCommon(creep, C.ATTACK),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => checkTarget(target, Creep, Structure),
		() => checkDestructible(target),
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

function checkDestructible(target: Creep | Structure) {
	return target.hits === undefined ? C.ERR_INVALID_TARGET : C.OK;
}

/**
 * Invokes damage capture callback from top to bottom and returns the remaining power which should
 * be applied to the target.
 */
export function captureDamage(target: RoomObject, initialPower: number, type: number, source?: RoomObject) {
	// Sort objects by layer
	const objects = [ ...Fn.reject(target.room['#lookAt'](target.pos),
		object => object['#layer'] === undefined || object.hits === undefined) ];
	objects.sort((left, right) => right['#layer']! - left['#layer']!);

	// Calculate total power, allowing objects on higher layers to deduct damage [ramparts]
	let power = initialPower;
	let iterationPower = power;
	let layer: number | undefined;
	for (const object of objects) {
		const objectLayer = object['#layer'];
		if (object === target) {
			return power;
		} else if (layer !== objectLayer) {
			layer = objectLayer;
			power = iterationPower;
			if (power <= 0) {
				return 0;
			}
		}
		// The idea here is that multiple objects on the same layer can capture damage simultaneously,
		// and whichever one captures more will be used. This doesn't apply to any existing game
		// objects, but idk maybe it could be interesting.
		iterationPower = Math.min(iterationPower, target['#captureDamage'](power, C.EVENT_ATTACK_TYPE_MELEE, source));
	}
	throw new Error('Object was never found');
}
