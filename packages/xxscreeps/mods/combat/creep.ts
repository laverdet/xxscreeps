import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { intents } from 'xxscreeps/game/index.js';
import { captureDamage } from 'xxscreeps/game/processor.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Creep, calculatePower, checkCommon } from 'xxscreeps/mods/creep/creep.js';
import { Structure, notifyAttacked } from 'xxscreeps/mods/structure/structure.js';
import { extend } from 'xxscreeps/utility/utility.js';

// Creep extension declaration
declare module 'xxscreeps/mods/creep/creep.js' {
	interface Creep {
		/**
		 * Attack another creep, power creep, or structure in a short-ranged attack. Requires the
		 * `ATTACK` body part. If the target is inside a rampart, then the rampart is attacked instead.
		 * The target has to be at adjacent square to the creep. If the target is a creep with `ATTACK`
		 * body parts and is not inside a rampart, it will automatically hit back at the attacker.
		 * @param target The target object to be attacked
		 */
		attack: (target: AttackTarget) => ReturnType<typeof checkAttack>;

		/**
		 * Heal self or another creep. It will restore the target creep’s damaged body parts function
		 * and increase the hits counter. Requires the `HEAL` body part. The target has to be at
		 * adjacent square to the creep.
		 * @param target The target creep object
		 */
		heal: (target: Creep) => ReturnType<typeof checkHeal>;

		/**
		 * A ranged attack against another creep or structure. Requires the `RANGED_ATTACK` body part.
		 * If the target is inside a rampart, the rampart is attacked instead. The target has to be
		 * within 3 squares range of the creep.
		 * @param target The target object to be attacked
		 */
		rangedAttack: (target: AttackTarget) => ReturnType<typeof checkRangedAttack>;

		/**
		 * Heal another creep at a distance. It will restore the target creep’s damaged body parts
		 * function and increase the hits counter. Requires the `HEAL` body part. The target has to be
		 * within 3 squares range of the creep.
		 * @param target The target creep object
		 */
		rangedHeal: (target: Creep) => ReturnType<typeof checkRangedHeal>;

		/**
		 * A ranged attack against all hostile creeps or structures within 3 squares range. Requires the
		 * `RANGED_ATTACK` body part. The attack power depends on the range to each target. Friendly units
		 * are not affected.
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
// TODO: Look into why passing `applyDamage` as an argument to an anonymous function breaks the
// babel transform
const applyDamage = Creep.prototype['#applyDamage'];
Creep.prototype['#applyDamage'] = function(this: Creep, power, type, source) {
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

export function checkDestructible(target: Creep | Structure) {
	if (target instanceof Creep && target.spawning) {
		return C.ERR_INVALID_TARGET;
	}
	return target.hits === undefined ? C.ERR_INVALID_TARGET : C.OK;
}

export function notifyAttackDamage(target: RoomObject, context: ProcessorContext, source: RoomObject | null) {
	if (target instanceof Structure || target instanceof Creep) {
		notifyAttacked(target, context, source ?? undefined);
	}
}

export function applyAttackDamage(
	target: RoomObject,
	power: number,
	type: number,
	source: RoomObject | null,
	context: ProcessorContext,
) {
	target['#applyDamage'](power, type, source ?? undefined);
	notifyAttackDamage(target, context, source);
}

/**
 * Like `captureDamage`, but also notifies any intermediate layer object (e.g. a rampart) that
 * absorbed some damage on the way to `target`.
 */
export function captureDamageWithNotify(
	target: RoomObject,
	initialPower: number,
	type: number,
	source: RoomObject | null,
	context: ProcessorContext,
) {
	return captureDamage(target, initialPower, type, source,
		object => notifyAttackDamage(object, context, source));
}
