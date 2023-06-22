import type { DestructibleStructure } from 'xxscreeps/mods/structure/structure.js';
import C from 'xxscreeps/game/constants/index.js';
import Fn from 'xxscreeps/utility/functional.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Creep, calculatePower } from 'xxscreeps/mods/creep/creep.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { registerIntentProcessor } from 'xxscreeps/engine/processor/index.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { captureDamage, checkAttack, checkHeal, checkRangedAttack, checkRangedHeal, checkRangedMassAttack } from './creep.js';
import { mapArea } from 'xxscreeps/game/room/look.js';

declare module 'xxscreeps/engine/processor' {
	interface Intent { combat: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'attack', {
		before: 'harvest',
		type: 'primary',
	}, (creep, context, id: string) => {
		const target = Game.getObjectById<Creep | DestructibleStructure>(id)!;
		if (checkAttack(creep, target) === C.OK) {
			const power = calculatePower(creep, C.ATTACK, C.ATTACK_POWER);
			const damage = captureDamage(target, power, C.EVENT_ATTACK_TYPE_MELEE, creep);
			if (damage > 0) {
				target['#applyDamage'](damage, C.EVENT_ATTACK_TYPE_MELEE, creep);
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
			const power = calculatePower(creep, C.RANGED_ATTACK, C.RANGED_ATTACK_POWER);
			const damage = captureDamage(target, power, C.RANGED_ATTACK_POWER, creep);
			if (damage > 0) {
				target['#applyDamage'](damage, C.RANGED_ATTACK_POWER, creep);
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
			const area = mapArea(
				Math.max(0, creep.pos.y - 3),
				Math.max(0, creep.pos.x - 3),
				Math.min(49, creep.pos.y + 3),
				Math.min(49, creep.pos.x + 3),
				(xx, yy) => new RoomPosition(xx, yy, creep.room.name));
			const basePower = calculatePower(creep, C.RANGED_ATTACK, C.RANGED_ATTACK_POWER);
			for (const pos of area) {

				// Sort objects by layer
				const objects = [ ...Fn.reject(creep.room['#lookAt'](pos),
					object => object['#layer'] === undefined || object.hits === undefined || object.my !== false) ];
				objects.sort((left, right) => right['#layer']! - left['#layer']!);

				// Apply and capture damage
				let power = basePower * [ 1, 1, 0.4, 0.1 ][creep.pos.getRangeTo(pos)];
				let iterationPower = power;
				let layer: number | undefined;
				for (const object of objects) {
					const objectLayer = object['#layer'];
					if (layer !== objectLayer) {
						layer = objectLayer;
						power = iterationPower;
						if (power <= 0) {
							break;
						}
					}
					iterationPower = Math.min(iterationPower, object['#captureDamage'](power, C.EVENT_ATTACK_TYPE_RANGED_MASS, creep));
					object['#applyDamage'](power, C.EVENT_ATTACK_TYPE_RANGED_MASS, creep);
					appendEventLog(object.room, {
						event: C.EVENT_ATTACK,
						objectId: creep.id,
						targetId: object.id,
						attackType: C.EVENT_ATTACK_TYPE_RANGED_MASS,
						damage: power,
					});
				}
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
			const power = calculatePower(creep, C.HEAL, C.HEAL_POWER);
			target.tickHitsDelta = (target.tickHitsDelta ?? 0) + power;
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
			const power = calculatePower(creep, C.HEAL, C.RANGED_HEAL_POWER);
			target.tickHitsDelta = (target.tickHitsDelta ?? 0) + power;
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
