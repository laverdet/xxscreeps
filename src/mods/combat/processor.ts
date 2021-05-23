import type { AttackTypes } from './game';
import type { DestructibleStructure } from 'xxscreeps/mods/structure/structure';
import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { registerIntentProcessor } from 'xxscreeps/engine/processor';
import { appendEventLog } from 'xxscreeps/game/room/event-log';
import { checkAttack, checkHeal, checkRangedAttack, checkRangedHeal, checkRangedMassAttack } from './creep';

declare module 'xxscreeps/engine/processor' {
	interface Intent { combat: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'attack', (creep, context, id: string) => {
		const target = Game.getObjectById<Creep | DestructibleStructure>(id)!;
		if (checkAttack(creep, target) === C.OK) {
			const damage = calculatePower(creep, C.ATTACK, C.ATTACK_POWER);
			processAttack(creep, target, C.EVENT_ATTACK_TYPE_MELEE, damage);
			creep['#actionLog'].push({ action: 'attack', x: target.pos.x, y: target.pos.y });
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'heal', (creep, context, id: string) => {
		const target = Game.getObjectById<Creep>(id)!;
		if (checkHeal(creep, target) === C.OK) {
			const amount = calculatePower(creep, C.HEAL, C.HEAL_POWER);
			target.hits += amount;
			appendEventLog(target.room, {
				event: C.EVENT_HEAL,
				objectId: creep.id,
				targetId: target.id,
				healType: C.EVENT_HEAL_TYPE_MELEE,
				amount,
			});
			creep['#actionLog'].push({ action: 'heal', x: target.pos.x, y: target.pos.y });
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'rangedAttack', (creep, context, id: string) => {
		const target = Game.getObjectById<Creep | DestructibleStructure>(id)!;
		if (checkRangedAttack(creep, target) === C.OK) {
			const damage = calculatePower(creep, C.RANGED_ATTACK, C.RANGED_ATTACK_POWER);
			processAttack(creep, target, C.EVENT_ATTACK_TYPE_RANGED, damage);
			creep['#actionLog'].push({ action: 'rangedAttack', x: target.pos.x, y: target.pos.y });
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'rangedHeal', (creep, context, id: string) => {
		const target = Game.getObjectById<Creep>(id)!;
		if (checkRangedHeal(creep, target) === C.OK) {
			const amount = calculatePower(creep, C.HEAL, C.RANGED_HEAL_POWER);
			target.hits += amount;
			appendEventLog(target.room, {
				event: C.EVENT_HEAL,
				objectId: creep.id,
				targetId: target.id,
				healType: C.EVENT_HEAL_TYPE_RANGED,
				amount,
			});
			creep['#actionLog'].push({ action: 'rangedHeal', x: target.pos.x, y: target.pos.y });
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'rangedMassAttack', (creep, context) => {
		if (checkRangedMassAttack(creep) === C.OK) {
			creep['#actionLog'].push({ action: 'rangedHeal', x: creep.pos.x, y: creep.pos.y });
			context.didUpdate();
			// TODO
		}
	}),
];

function processAttack(creep: Creep, target: Creep | DestructibleStructure, attackType: AttackTypes, damage: number) {
	target.hits -= damage;
	appendEventLog(target.room, {
		event: C.EVENT_ATTACK,
		objectId: creep.id,
		targetId: target.id,
		attackType,
		damage,
	});
	if (target instanceof Creep) {
		target['#actionLog'].push({ action: 'attacked', x: creep.pos.x, y: creep.pos.y });
	}
	if (creep.pos.isNearTo(target.pos)) {
		const counterAttack = calculatePower(creep, C.ATTACK, C.ATTACK_POWER);
		if (counterAttack > 0) {
			creep.hits -= counterAttack;
			creep['#actionLog'].push({ action: 'attacked', x: target.pos.x, y: target.pos.y });
			appendEventLog(target.room, {
				event: C.EVENT_ATTACK,
				objectId: target.id,
				targetId: creep.id,
				attackType: C.EVENT_ATTACK_TYPE_HIT_BACK,
				damage: counterAttack,
			});
		}
	}
}
