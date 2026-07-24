import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks.js';
import { intents } from 'xxscreeps/game/index.js';
import { Creep, checkCommon } from 'xxscreeps/mods/classic/creep/creep.js';
import { checkHasResource } from 'xxscreeps/mods/classic/resource/store.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { extend } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { ConstructionSite } from './construction-site.js';
import { structureFactories } from './symbols.js';

declare module 'xxscreeps/mods/classic/creep/creep.js' {
	interface Creep {
		/**
		 * Build a structure at the target construction site using carried energy. Requires `WORK` and
		 * `CARRY` body parts. The target has to be within 3 squares range of the creep.
		 * @param target The target construction site to be built.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
		 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`, `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.build
		 */
		build: (target: ConstructionSite) => ReturnType<typeof checkBuild>;

		/**
		 * Dismantles any structure that can be constructed (even hostile) returning 50% of the energy
		 * spent on its repair. Requires the `WORK` body part. If the creep has an empty `CARRY` body
		 * part, the energy is put into it; otherwise it is dropped on the ground. The target has to be
		 * at adjacent square to the creep.
		 * @param target The target structure.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
		 * `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.dismantle
		 */
		dismantle: (target: Structure) => ReturnType<typeof checkDismantle>;

		/**
		 * Repair a damaged structure using carried energy. Requires the `WORK` and `CARRY` body parts.
		 * The target has to be within 3 squares range of the creep.
		 * @param target The target structure to be repaired.
		 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
		 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`, `ERR_NOT_IN_RANGE`, `ERR_NO_BODYPART`
		 * @public
		 * @see https://docs.screeps.com/api/#Creep.repair
		 */
		repair: (target: Structure) => ReturnType<typeof checkRepair>;
	}
}

extend(Creep, {
	build(target: ConstructionSite) {
		return chainIntentChecks(
			() => checkBuild(this, target),
			() => intents.save(this, 'build', target.id));
	},

	dismantle(target: Structure) {
		return chainIntentChecks(
			() => checkDismantle(this, target),
			() => intents.save(this, 'dismantle', target.id));
	},

	repair(target: Structure) {
		return chainIntentChecks(
			() => checkRepair(this, target),
			() => intents.save(this, 'repair', target.id));
	},
});

export function checkBuild(creep: Creep, target: ConstructionSite) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkHasResource(creep, C.RESOURCE_ENERGY),
		() => checkTarget(target, ConstructionSite),
		() => checkRange(creep, target, 3),
		() => {
			// A friendly creep sitting on top of a construction site for an obstacle structure prevents
			// `build`
			const { room } = target;
			if (structureFactories.get(target.structureType)?.obstacle) {
				const creepFilter = room.controller?.safeMode === undefined ? () => true : (creep: Creep) => creep.my;
				for (const creep of room.lookForAt(C.LOOK_CREEPS, target.pos.x, target.pos.y)) {
					if (creepFilter(creep)) {
						return C.ERR_INVALID_TARGET;
					}
				}
			}
		});
}

export function checkDismantle(creep: Creep, target: Structure) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkTarget(target, Structure),
		() => target.structureType in C.CONSTRUCTION_COST ? C.OK : C.ERR_INVALID_TARGET,
		() => checkRange(creep, target, 1),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART),
		() => target['#invulnerable'] ? C.ERR_INVALID_TARGET : C.OK);
}

export function checkRepair(creep: Creep, target: Structure) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkHasResource(creep, C.RESOURCE_ENERGY),
		() => checkTarget(target, Structure),
		() => checkRange(creep, target, 3));
}
