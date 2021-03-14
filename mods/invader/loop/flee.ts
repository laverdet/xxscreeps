import * as C from 'xxscreeps/game/constants';
import * as PathFinder from 'xxscreeps/game/path-finder';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { getCostMatrix } from './rooms';

export default function(creep: Creep, range: number) {
	const nearCreeps = creep.pos.findInRange(C.FIND_HOSTILE_CREEPS, range - 1)
		.filter(ii => ii.getActiveBodyparts(C.ATTACK) + ii.getActiveBodyparts(C.RANGED_ATTACK) > 0);

	if (nearCreeps.length > 0) {
		const ret = PathFinder.search(creep.pos, nearCreeps.map(ii => ({
			pos: ii.pos,
			range,
		})), {
			maxRooms: 1,
			flee: true,
			roomCallback: getCostMatrix,
		});
		if (ret.path.length > 0) {
			creep.move(creep.pos.getDirectionTo(ret.path[0]));
			creep.say('flee');
			return true;
		}
	}
	return false;
}
