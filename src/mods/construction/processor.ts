import type { ConstructibleStructureType } from './construction-site';
import type { DestructibleStructure } from 'xxscreeps/mods/structure/structure';
import C from 'xxscreeps/game/constants';
import * as Resource from 'xxscreeps/mods/resource/processor/resource';
import { Game, me } from 'xxscreeps/game';
import { Creep, calculatePower } from 'xxscreeps/mods/creep/creep';
import { RoomPosition } from 'xxscreeps/game/position';
import { saveAction } from 'xxscreeps/game/object';
import { Room } from 'xxscreeps/game/room';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { ConstructionSite, checkRemove, create } from './construction-site';
import { checkBuild, checkDismantle, checkRepair } from './creep';
import { checkCreateConstructionSite } from './room';
import { structureFactories } from './symbols';

declare module 'xxscreeps/engine/processor' {
	interface Intent { construction: typeof intents }
}

const intents = [
	registerIntentProcessor(Room, 'createConstructionSite', {},
		(room, context, structureType: ConstructibleStructureType, xx: number, yy: number, name: string | null) => {
			const pos = new RoomPosition(xx, yy, room.name);
			if (checkCreateConstructionSite(room, pos, structureType, name) === C.OK) {
				const site = create(pos, structureType, me, name);
				room['#insertObject'](site, true);
				context.didUpdate();
			}
		}),

	registerIntentProcessor(ConstructionSite, 'remove', {}, (site, context) => {
		if (checkRemove(site) === C.OK) {
			Resource.drop(site.pos, C.RESOURCE_ENERGY, site.progress / 2);
			site.room['#removeObject'](site);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'build', {
		before: [ 'attack', 'harvest', 'rangedMassAttack' ],
		type: [ 'primary', 'laser' ],
	}, (creep, context, id: string) => {
		const target = Game.getObjectById<ConstructionSite>(id)!;
		if (checkBuild(creep, target) === C.OK) {
			const power = calculatePower(creep, C.WORK, C.BUILD_POWER);
			const energy = Math.min(
				target.progressTotal - target.progress,
				creep.store.energy,
				power,
			);
			if (energy > 0) {
				creep.store['#subtract'](C.RESOURCE_ENERGY, energy);
				target.progress += energy;
				saveAction(creep, 'build', target.pos);
				context.didUpdate();
			}
		}
	}),

	registerIntentProcessor(Creep, 'dismantle', {
		before: 'repair',
		type: 'primary',
	}, (creep, context, id: string) => {
		const target = Game.getObjectById<DestructibleStructure>(id)!;
		if (checkDismantle(creep, target) === C.OK) {
			const effect = Math.min(calculatePower(creep, C.WORK, C.DISMANTLE_POWER), target.hits);
			if (effect > 0) {
				const energy = Math.floor(effect * C.DISMANTLE_COST);
				const overflow = Math.max(energy - creep.store.getFreeCapacity(C.RESOURCE_ENERGY), 0);
				creep.store['#add'](C.RESOURCE_ENERGY, energy - overflow);
				if (overflow > 0) {
					Resource.drop(creep.pos, 'energy', overflow);
				}
				target.hits -= effect;
				// TODO: dismantle event + destroy hook
				// saveAction(creep, 'dismantle', target.pos.x, target.pos.y);
				context.didUpdate();
			}
		}
	}),

	registerIntentProcessor(Creep, 'repair', {
		before: [ 'build', 'rangedMassAttack' ],
		type: [ 'primary', 'laser' ],
	}, (creep, context, id: string) => {
		const target = Game.getObjectById<DestructibleStructure>(id)!;
		if (checkRepair(creep, target) === C.OK) {
			const effect = Math.min(
				calculatePower(creep, C.WORK, C.REPAIR_POWER),
				target.hitsMax - target.hits,
				creep.store.energy / C.REPAIR_COST);
			if (effect > 0) {
				creep.store['#subtract'](C.RESOURCE_ENERGY, effect * C.REPAIR_COST);
				target.hits += effect;
				saveAction(creep, 'repair', target.pos);
				context.didUpdate();
			}
		}
	}),
];

registerObjectTickProcessor(ConstructionSite, (site, context) => {
	if (site.progress >= site.progressTotal) {
		const { room } = site;
		const structure = structureFactories.get(site.structureType)?.create(site, site.name);
		site.room['#removeObject'](site);
		if (structure) {
			room['#insertObject'](structure, true);
		}
		context.didUpdate();
	}
});
