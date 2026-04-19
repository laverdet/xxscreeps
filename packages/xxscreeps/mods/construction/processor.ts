import type { ConstructibleStructureType } from './construction-site.js';
import type { DestructibleStructure } from 'xxscreeps/mods/structure/structure.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, me } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { Creep, calculateBoundedEffect, calculatePower } from 'xxscreeps/mods/creep/creep.js';
import * as Resource from 'xxscreeps/mods/resource/processor/resource.js';
import { ConstructionSite, checkRemove, create } from './construction-site.js';
import { checkBuild, checkDismantle, checkRepair } from './creep.js';
import { checkCreateConstructionSite } from './room.js';
import { structureFactories } from './symbols.js';

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { construction: typeof intents }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
			// Vanilla semantics: energy cost derives from unboosted WORK parts,
			// progress applied uses the boosted output.
			const buildRemaining = target.progressTotal - target.progress;
			const { unboosted: energy, boosted } = calculateBoundedEffect(
				creep, C.WORK, C.BUILD_POWER, 'build',
				Math.min(buildRemaining, creep.store.energy),
			);
			if (energy > 0) {
				creep.store['#subtract'](C.RESOURCE_ENERGY, energy);
				target.progress += Math.min(boosted, buildRemaining);
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
			const effect = Math.min(calculatePower(creep, C.WORK, C.DISMANTLE_POWER, 'dismantle'), target.hits);
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
			// Vanilla semantics: `repairEffect` (unboosted) caps hits and drives
			// energy cost; `boostedEffect` is the hits applied to the target.
			const repairHitsMax = target.hitsMax - target.hits;
			const { unboosted: effect, boosted } = calculateBoundedEffect(
				creep, C.WORK, C.REPAIR_POWER, 'repair',
				Math.min(repairHitsMax, creep.store.energy / C.REPAIR_COST),
			);
			if (effect > 0) {
				const energyCost = Math.min(creep.store.energy, Math.ceil(effect * C.REPAIR_COST));
				creep.store['#subtract'](C.RESOURCE_ENERGY, energyCost);
				target.hits += Math.min(boosted, repairHitsMax);
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
