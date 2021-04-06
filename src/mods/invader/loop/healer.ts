import type { Creep } from 'xxscreeps/mods/creep/creep';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import flee from './flee';

export default function(creep: Creep, healers: Creep[]) {
	const healTargets = creep.pos.findInRange(C.FIND_MY_CREEPS, 3);
	if (healTargets.length > 0) {
		const healTarget = Fn.minimum(healTargets,
			(left, right) => (right.hitsMax - right.hits) - (left.hitsMax - left.hits))!;
		if (creep.pos.isNearTo(healTarget)) {
			creep.heal(healTarget);
		} else {
			creep.rangedHeal(healTarget);
		}
	}
	let target: Creep | undefined;
	if (creep.hits < creep.hitsMax / 2) {
		if (!flee(creep, 4)) {
			target = creep.pos.findClosestByPath(healers);
			if (target) {
				creep.moveTo(target, {
					maxRooms: 1,
					ignoreRoads: true,
				});
			}
		}
		return;
	}
	target = creep.pos.findClosestByRange(C.FIND_MY_CREEPS, {
		filter: ii => ii.hits < ii.hitsMax,
	});
	if (!target) {
		if (flee(creep, 4)) {
			return;
		}
		target = creep.pos.findClosestByRange(C.FIND_MY_CREEPS, {
			filter: ii => ii !== creep && ii.getActiveBodyparts(C.HEAL) == 0,
		});
	}
	if (!target) {
		creep.suicide();
		return;
	}
	if (creep.pos.isNearTo(target)) {
		creep.move(creep.pos.getDirectionTo(target));
	} else {
		creep.moveTo(target, {
			maxRooms: 1,
			ignoreRoads: true,
			reusePath: 0,
		});
	}
}
