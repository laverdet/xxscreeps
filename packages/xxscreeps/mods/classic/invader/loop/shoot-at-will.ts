import type { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps:mods/constants';

/**
 * Free shots at whoever wandered into range. Only creeps are ever shot at — a raid tears down
 * structures solely to reach its victims, which `findAttack` handles.
 */
export default function shootAtWill(creep: Creep, hostiles: Creep[]) {
	if (creep.getActiveBodyparts(C.RANGED_ATTACK) === 0) {
		return;
	}
	const targets = hostiles.filter(hostile => creep.pos.inRangeTo(hostile, 3));
	const target = Fn.minimum(targets, (left, right) => left.hits - right.hits);
	if (target) {
		creep.rangedAttack(target);
	}
}
