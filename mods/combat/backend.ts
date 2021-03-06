import * as Game from 'xxscreeps/game/game';
import { bindEventRenderer } from 'xxscreeps/backend';
import * as C from './constants';

bindEventRenderer(C.EVENT_ATTACK, event => {
	const creep = Game.getObjectById(event.objectId);
	const target = Game.getObjectById(event.targetId);
	if (creep && target) {
		const attackTypes: Record<number, string | undefined> = {
			[C.EVENT_ATTACK_TYPE_MELEE]: 'attack',
			[C.EVENT_ATTACK_TYPE_RANGED]: 'rangedAttack',
			[C.EVENT_ATTACK_TYPE_RANGED_MASS]: 'rangedMassAttack',
		};
		const actionType = attackTypes[event.attackType];
		return {
			...actionType && {
				[creep.id]: {
					actionLog: {
						[actionType]: { x: target.pos.x, y: target.pos.y },
					},
				},
			},
			[target.id]: {
				actionLog: {
					attacked: { x: creep.pos.x, y: creep.pos.y },
				},
			},
		};
	}
});

bindEventRenderer(C.EVENT_HEAL, event => {
	const creep = Game.getObjectById(event.objectId);
	const target = Game.getObjectById(event.targetId);
	if (creep && target) {
		const actionType = {
			[C.EVENT_HEAL_TYPE_MELEE]: 'heal',
			[C.EVENT_HEAL_TYPE_RANGED]: 'rangedHeal',
		}[event.healType];
		return {
			[creep.id]: {
				actionLog: {
					[actionType]: { x: target.pos.x, y: target.pos.y },
				},
			},
			[target.id]: {
				actionLog: {
					attacked: { x: creep.pos.x, y: creep.pos.y },
				},
			},
		};
	}
});
