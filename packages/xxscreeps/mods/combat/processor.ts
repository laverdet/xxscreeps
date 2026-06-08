import type { DestructibleStructure } from 'xxscreeps/mods/structure/structure.js';
import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { invertedNumericComparator, mappedComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { positionsInRangeTo } from 'xxscreeps/game/position.js';
import { walkLayers } from 'xxscreeps/game/processor.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Creep, calculatePower } from 'xxscreeps/mods/creep/creep.js';
import { applyAttackDamage, captureDamageWithNotify, checkAttack, checkHeal, checkRangedAttack, checkRangedHeal, checkRangedMassAttack, notifyAttackDamage } from './creep.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { combat: typeof intents }
}

const kRangedMassAttackPower = [ 1, 1, 0.4, 0.1 ];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(Creep, 'attack', {
		before: 'harvest',
		type: 'primary',
	}, (creep, context, id: string) => {
		const target = Game.getObjectById<Creep | DestructibleStructure>(id)!;
		if (checkAttack(creep, target) === C.OK) {
			const power = calculatePower(creep, C.ATTACK, C.ATTACK_POWER, 'attack');
			const damage = captureDamageWithNotify(target, power, C.EVENT_ATTACK_TYPE_MELEE, creep, context);
			if (damage > 0) {
				applyAttackDamage(target, damage, C.EVENT_ATTACK_TYPE_MELEE, creep, context);
				appendEventLog(target.room, {
					event: C.EVENT_ATTACK,
					objectId: creep.id,
					targetId: target.id,
					attackType: C.EVENT_ATTACK_TYPE_MELEE,
					damage,
				});
			}
			saveAction(creep, 'attack', target.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'rangedAttack', {
		after: 'build',
		type: 'laser',
	}, (creep, context, id: string) => {
		const target = Game.getObjectById<Creep | DestructibleStructure>(id)!;
		if (checkRangedAttack(creep, target) === C.OK) {
			const power = calculatePower(creep, C.RANGED_ATTACK, C.RANGED_ATTACK_POWER, 'rangedAttack');
			const damage = captureDamageWithNotify(target, power, C.EVENT_ATTACK_TYPE_RANGED, creep, context);
			if (damage > 0) {
				applyAttackDamage(target, damage, C.EVENT_ATTACK_TYPE_RANGED, creep, context);
				appendEventLog(target.room, {
					event: C.EVENT_ATTACK,
					objectId: creep.id,
					targetId: target.id,
					attackType: C.EVENT_ATTACK_TYPE_RANGED,
					damage,
				});
			}
			saveAction(creep, 'rangedAttack', target.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'rangedMassAttack', {
		before: 'rangedAttack',
		type: 'laser',
	}, (creep, context) => {
		if (checkRangedMassAttack(creep) === C.OK) {
			const basePower = calculatePower(creep, C.RANGED_ATTACK, C.RANGED_ATTACK_POWER, 'rangedMassAttack');
			for (const pos of positionsInRangeTo(creep.pos, 3)) {
				const power = basePower * (kRangedMassAttackPower[creep.pos.getRangeTo(pos)] ?? 0);
				const objects = Fn.pipe(
					creep.room['#lookAt'](pos),
					$$ => Fn.reject($$, object =>
						object['#layer'] === undefined || object.hits === undefined || object.my !== false),
					$$ => [ ...$$ ],
					$$ => $$.sort(mappedComparator(invertedNumericComparator, object => object['#layer']!)));
				walkLayers(objects, power, (object, layerPower) => {
					const remaining = object['#captureDamage'](layerPower, C.EVENT_ATTACK_TYPE_RANGED_MASS, creep);
					const absorbed = layerPower - remaining;
					if (absorbed === 0) {
						applyAttackDamage(object, layerPower, C.EVENT_ATTACK_TYPE_RANGED_MASS, creep, context);
					} else {
						notifyAttackDamage(object, context, creep);
					}
					appendEventLog(object.room, {
						event: C.EVENT_ATTACK,
						objectId: creep.id,
						targetId: object.id,
						attackType: C.EVENT_ATTACK_TYPE_RANGED_MASS,
						damage: absorbed || layerPower,
					});
					return remaining;
				});
			}
			saveAction(creep, 'rangedMassAttack', creep.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'heal', {
		before: [ 'attack', 'rangedHeal' ],
		type: 'primary',
	}, (creep, context, id: string) => {
		const target = Game.getObjectById<Creep>(id)!;
		if (checkHeal(creep, target) === C.OK) {
			const power = calculatePower(creep, C.HEAL, C.HEAL_POWER, 'heal');
			target.tickHealing = (target.tickHealing ?? 0) + power;
			appendEventLog(target.room, {
				event: C.EVENT_HEAL,
				objectId: creep.id,
				targetId: target.id,
				healType: C.EVENT_HEAL_TYPE_MELEE,
				amount: power,
			});
			saveAction(creep, 'heal', target.pos);
			saveAction(target, 'healed', creep.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'rangedHeal', {
		after: 'heal',
		before: [ 'attackController', 'rangedMassAttack', 'repair' ],
		type: [ 'primary', 'laser' ],
	}, (creep, context, id: string) => {
		const target = Game.getObjectById<Creep>(id)!;
		if (checkRangedHeal(creep, target) === C.OK) {
			const power = calculatePower(creep, C.HEAL, C.RANGED_HEAL_POWER, 'rangedHeal');
			target.tickHealing = (target.tickHealing ?? 0) + power;
			appendEventLog(target.room, {
				event: C.EVENT_HEAL,
				objectId: creep.id,
				targetId: target.id,
				healType: C.EVENT_HEAL_TYPE_RANGED,
				amount: power,
			});
			saveAction(creep, 'rangedHeal', target.pos);
			saveAction(target, 'healed', creep.pos);
			context.didUpdate();
		}
	}),
];
