import C from 'xxscreeps/game/constants/index.js';
import { Game, me } from 'xxscreeps/game/index.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { StructureRampart } from './rampart.js';
import { StructureTower, checkTower } from './tower.js';
import { clamp } from 'xxscreeps/utility/utility.js';
import { captureDamage } from 'xxscreeps/mods/combat/creep.js';
import { Structure } from 'xxscreeps/mods/structure/structure.js';

function calculateEfficiency(tower: StructureTower, target: Creep | Structure) {
	const range = clamp(C.TOWER_OPTIMAL_RANGE, C.TOWER_FALLOFF_RANGE, tower.pos.getRangeTo(target.pos));
	return 1 - C.TOWER_FALLOFF * (range - C.TOWER_OPTIMAL_RANGE) / (C.TOWER_FALLOFF_RANGE - C.TOWER_OPTIMAL_RANGE);
}

const intents = [
	registerIntentProcessor(StructureTower, 'attack', { type: 'primary' }, (tower, context, id: string) => {
		const target = Game.getObjectById<Creep>(id)!;
		if (checkTower(tower, target, Creep) === C.OK) {
			tower.store['#subtract'](C.RESOURCE_ENERGY, C.TOWER_ENERGY_COST);
			const power = C.TOWER_POWER_ATTACK * calculateEfficiency(tower, target);
			const damage = captureDamage(target, power, C.EVENT_ATTACK_TYPE_RANGED, tower);
			if (damage > 0) {
				target['#applyDamage'](damage, C.EVENT_ATTACK_TYPE_RANGED, tower);
				appendEventLog(target.room, {
					event: C.EVENT_ATTACK,
					objectId: tower.id,
					targetId: target.id,
					attackType: C.EVENT_ATTACK_TYPE_RANGED,
					damage,
				});
			}
			saveAction(tower, 'attack', target.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureTower, 'heal', {
		before: 'repair',
		type: 'primary',
	}, (tower, context, id: string) => {
		const target = Game.getObjectById<Creep>(id)!;
		if (checkTower(tower, target, Creep) === C.OK) {
			tower.store['#subtract'](C.RESOURCE_ENERGY, C.TOWER_ENERGY_COST);
			const power = C.TOWER_POWER_HEAL * calculateEfficiency(tower, target);
			target.tickHitsDelta = (target.tickHitsDelta ?? 0) + power;
			appendEventLog(target.room, {
				event: C.EVENT_HEAL,
				objectId: tower.id,
				targetId: target.id,
				healType: C.EVENT_HEAL_TYPE_RANGED,
				amount: power,
			});
			saveAction(tower, 'heal', target.pos);
			saveAction(target, 'healed', tower.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureTower, 'repair', {
		before: 'attack',
		type: 'primary',
	}, (tower, context, id: string) => {
		const target = Game.getObjectById<Structure>(id)!;
		if (checkTower(tower, target, Structure) === C.OK) {
			tower.store['#subtract'](C.RESOURCE_ENERGY, C.TOWER_ENERGY_COST);
			const power = C.TOWER_POWER_REPAIR * calculateEfficiency(tower, target);
			target.hits = Math.min(target.hitsMax!, target.hits! + power);
			appendEventLog(target.room, {
				event: C.EVENT_REPAIR,
				objectId: tower.id,
				targetId: target.id,
				amount: power,
				energySpent: C.TOWER_ENERGY_COST,
			});
			saveAction(tower, 'repair', target.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureRampart, 'setPublic', {}, (rampart, context, isPublic: boolean) => {
		if (rampart['#user'] === me) {
			rampart.isPublic = Boolean(isPublic);
			context.didUpdate();
		}
	}),
];
declare module 'xxscreeps/engine/processor' {
	interface Intent { defense: typeof intents }
}

registerObjectTickProcessor(StructureRampart, (rampart, context) => {
	if (rampart.ticksToDecay === 0) {
		rampart.hits -= C.RAMPART_DECAY_AMOUNT;
		context.didUpdate();
		if (rampart.hits <= 0) {
			rampart.room['#removeObject'](rampart);
			return;
		}
		rampart['#nextDecayTime'] = Game.time + C.RAMPART_DECAY_TIME - 1;
	}
	context.wakeAt(rampart['#nextDecayTime']);
});
