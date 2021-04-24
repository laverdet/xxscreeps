import * as C from 'xxscreeps/game/constants';
import { intents } from 'xxscreeps/game';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks';
import { Creep, checkCommon } from 'xxscreeps/mods/creep/creep';
import { extend } from 'xxscreeps/utility/utility';
import { ConstructionSite } from './construction-site';
import { structureFactories } from './symbols';

declare module 'xxscreeps/mods/creep/creep' {
	interface Creep {
		/**
		 * Build a structure at the target construction site using carried energy. Requires `WORK` and
		 * `CARRY` body parts. The target has to be within 3 squares range of the creep.
		 * @param target The target construction site to be built
		 */
		build(target: ConstructionSite): ReturnType<typeof checkBuild>;
	}
}

extend(Creep, {
	build(target: ConstructionSite) {
		return chainIntentChecks(
			() => checkBuild(this, target),
			() => intents.save(this, 'build', target.id));
	},
});

export function checkBuild(creep: Creep, target: ConstructionSite) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkTarget(target, ConstructionSite),
		() => checkRange(creep, target, 3),
		() => {
			if (creep.carry.energy <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}

			// A friendly creep sitting on top of a construction site for an obstacle structure prevents
			// `build`
			const { room } = target;
			if (structureFactories.get(target.structureType)?.obstacle) {
				const creepFilter = room.controller?.safeMode ? (creep: Creep) => creep.my : () => true;
				for (const creep of room.find(C.FIND_CREEPS)) {
					if (target.pos.isEqualTo(creep) && creepFilter(creep)) {
						return C.ERR_INVALID_TARGET;
					}
				}
			}
			return C.OK;
		});
}
