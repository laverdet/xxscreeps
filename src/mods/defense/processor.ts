import * as C from 'xxscreeps/game/constants';
import { Game, me } from 'xxscreeps/game';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { appendEventLog } from 'xxscreeps/game/room/event-log';
import { saveAction } from 'xxscreeps/game/object';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { StructureRampart } from './rampart';
import { StructureTower, checkTower } from './tower';
import { clamp } from 'xxscreeps/utility/utility';
import { captureDamage } from 'xxscreeps/mods/combat/creep';
import { Structure } from 'xxscreeps/mods/structure/structure';

function calculateEfficiency(tower: StructureTower, target: Creep | Structure) {
	const range = clamp(tower.pos.getRangeTo(target.pos), C.TOWER_FALLOFF_RANGE, C.TOWER_OPTIMAL_RANGE);
	return 1 - C.TOWER_FALLOFF * (range - C.TOWER_OPTIMAL_RANGE) / (C.TOWER_FALLOFF_RANGE - C.TOWER_OPTIMAL_RANGE);
}

const intents = [
	registerIntentProcessor(StructureTower, 'attack', (tower, context, id: string) => {
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

	registerIntentProcessor(StructureTower, 'heal', (tower, context, id: string) => {
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

	registerIntentProcessor(StructureTower, 'repair', (tower, context, id: string) => {
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

	registerIntentProcessor(StructureRampart, 'setPublic', (rampart, context, isPublic: boolean) => {
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
