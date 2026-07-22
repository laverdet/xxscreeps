import type { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import * as PathFinder from 'xxscreeps/game/pathfinder/index.js';
import * as C from 'xxscreeps:mods/constants';
import { getCostMatrix } from './rooms.js';

export default function flee(creep: Creep, range: number) {
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
		const [ next ] = ret.path;
		if (next) {
			creep.move(creep.pos.getDirectionTo(next));
			creep.say('flee');
			return true;
		}
	}
	return false;
}
