import type { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import type { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps:mods/constants';

export default function shootAtWill(creep: Creep) {
	if (creep.getActiveBodyparts(C.RANGED_ATTACK) === 0) {
		return;
	}
	const targets: (Creep | Structure)[] = function() {
		const creeps = creep.pos.findInRange(C.FIND_HOSTILE_CREEPS, 3);
		if (creeps.length > 0) {
			return creeps;
		}
		return creep.pos.findInRange(C.FIND_HOSTILE_STRUCTURES, 3);
	}();
	if (targets.length === 0) {
		return;
	}

	const target = Fn.minimum(targets, (left, right) => left.hits! - right.hits!)!;
	creep.rangedAttack(target);
}
