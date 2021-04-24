import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { registerIntentProcessor } from 'xxscreeps/processor';
import { appendEventLog } from 'xxscreeps/game/room/event-log';
import { saveAction } from 'xxscreeps/game/action-log';

import { AttackTarget, checkAttack, checkHeal, checkRangedAttack, checkRangedHeal, checkRangedMassAttack } from './creep';
import { AttackTypes } from './game';

declare module 'xxscreeps/processor' {
	interface Intent { combat: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'attack', (creep, context, id: string) => {
		const target = Game.getObjectById<AttackTarget>(id)!;
		if (checkAttack(creep, target) === C.OK) {
			const damage = calculatePower(creep, C.ATTACK, C.ATTACK_POWER);
			processAttack(creep, target, C.EVENT_ATTACK_TYPE_MELEE, damage);
			saveAction(creep, 'attack', target.pos.x, target.pos.y);
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
			saveAction(creep, 'heal', target.pos.x, target.pos.y);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'rangedAttack', (creep, context, id: string) => {
		const target = Game.getObjectById<AttackTarget>(id)!;
		if (checkRangedAttack(creep, target) === C.OK) {
			const damage = calculatePower(creep, C.RANGED_ATTACK, C.RANGED_ATTACK_POWER);
			processAttack(creep, target, C.EVENT_ATTACK_TYPE_RANGED, damage);
			saveAction(creep, 'rangedAttack', target.pos.x, target.pos.y);
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
			saveAction(creep, 'rangedHeal', target.pos.x, target.pos.y);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'rangedMassAttack', (creep, context) => {
		if (checkRangedMassAttack(creep) === C.OK) {
			saveAction(creep, 'rangedMassAttack', creep.pos.x, creep.pos.y);
			context.didUpdate();
			// TODO
		}
	}),
];

function processAttack(creep: Creep, target: AttackTarget, attackType: AttackTypes, damage: number) {
	target.hits -= damage;
	appendEventLog(target.room, {
		event: C.EVENT_ATTACK,
		objectId: creep.id,
		targetId: target.id,
		attackType,
		damage,
	});
	if (target instanceof Creep) {
		saveAction(target, 'attacked', creep.pos.x, creep.pos.y);
	}
	if (creep.pos.isNearTo(target.pos)) {
		const counterAttack = calculatePower(creep, C.ATTACK, C.ATTACK_POWER);
		if (counterAttack > 0) {
			creep.hits -= counterAttack;
			saveAction(creep, 'attacked', target.pos.x, target.pos.y);
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
