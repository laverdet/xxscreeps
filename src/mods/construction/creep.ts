import C from 'xxscreeps/game/constants/index.js';
import { intents } from 'xxscreeps/game/index.js';
import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks.js';
import { checkHasResource } from 'xxscreeps/mods/resource/store.js';
import { Creep, checkCommon } from 'xxscreeps/mods/creep/creep.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { ConstructionSite } from './construction-site.js';
import { Structure } from 'xxscreeps/mods/structure/structure.js';
import { structureFactories } from './symbols.js';

declare module 'xxscreeps/mods/creep/creep' {
	interface Creep {
		/**
		 * Build a structure at the target construction site using carried energy. Requires `WORK` and
		 * `CARRY` body parts. The target has to be within 3 squares range of the creep.
		 * @param target The target construction site to be built
		 */
		build(target: ConstructionSite): ReturnType<typeof checkBuild>;

		/**
		 * Repair a damaged structure using carried energy. Requires the WORK and CARRY body parts. The
		 * target has to be within 3 squares range of the creep.
		 * @param target The target structure to be repaired.
		 */
		dismantle(target: Structure): ReturnType<typeof checkDismantle>;

		/**
		 * Repair a damaged structure using carried energy. Requires the WORK and CARRY body parts. The
		 * target has to be within 3 squares range of the creep.
		 * @param target The target structure to be repaired.
		 */
		repair(target: Structure): ReturnType<typeof checkRepair>;
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
		() => checkTarget(target, ConstructionSite),
		() => checkRange(creep, target, 3),
		() => checkHasResource(creep, C.RESOURCE_ENERGY),
		() => {
			// A friendly creep sitting on top of a construction site for an obstacle structure prevents
			// `build`
			const { room } = target;
			if (structureFactories.get(target.structureType)?.obstacle) {
				const creepFilter = room.controller?.safeMode ? (creep: Creep) => creep.my : () => true;
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
		() => checkRange(creep, target, 1),
		() => checkSafeMode(creep.room, C.ERR_NO_BODYPART));
}

export function checkRepair(creep: Creep, target: Structure) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkTarget(target, Structure),
		() => checkRange(creep, target, 3),
		() => checkHasResource(creep, C.RESOURCE_ENERGY));
}
