import * as C from 'xxscreeps/game/constants';
import type { Creep } from 'xxscreeps/game/objects/creep';
import type { Structure } from 'xxscreeps/game/objects/structures';
import { minimum } from 'xxscreeps/utility/utility';

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
	const target = minimum(targets, (left, right) => left.hits - right.hits);
	creep.rangedAttack(target);
}
