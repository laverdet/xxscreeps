import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import type { Creep } from 'xxscreeps/mods/creep/creep';
import type { Structure } from 'xxscreeps/mods/structure/structure';

export default function(creep: Creep) {
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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const target = Fn.minimum(targets, (left, right) => left.hits! - right.hits!)!;
	creep.rangedAttack(target);
}
