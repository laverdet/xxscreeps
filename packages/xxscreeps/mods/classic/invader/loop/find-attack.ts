import type * as PathFinder from 'xxscreeps/game/pathfinder/index.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { Creep, SavedMovePath } from 'xxscreeps/mods/classic/creep/creep.js';
import type { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import * as C from 'xxscreeps:mods/constants';
import flee from './flee.js';
import { isRaidTarget } from './target.js';

/**
 * Whether `pos1` can walk up to `pos2`. An empty path means the search never left the origin, which
 * is either because it's already there or because nothing leads there at all.
 */
function checkPath(pos1: RoomPosition, pos2: RoomPosition) {
	const step = pos1.findPathTo(pos2, { maxRooms: 1 }).at(-1);
	if (step === undefined) {
		return pos1.isNearTo(pos2);
	} else {
		return pos2.isNearTo(step.x, step.y);
	}
}

function costCallbackIgnoreRamparts(fortifications: Structure[], roomName: string, cm: PathFinder.CostMatrix): undefined {
	fortifications.forEach(ii => cm.set(ii.pos.x, ii.pos.y, 0));
}

const pathOptions = { maxRoads: 1, maxRooms: 1, ignoreRoads: true, serializeMemory: false };
export default function findAttack(creep: Creep, healers: Creep[], hostiles: Creep[], fortifications: Structure[]) {
	// Shooters kite rather than trade blows; anything without a ranged weapon has to close in
	const haveAttack = creep.getActiveBodyparts(C.ATTACK) > 0;
	if (!haveAttack && creep.getActiveBodyparts(C.RANGED_ATTACK) > 0 && flee(creep, 3)) {
		return;
	}

	if (creep.hits < creep.hitsMax / 2 && !haveAttack) {
		const healer = creep.pos.findClosestByPath(healers, { ignoreRoads: true });
		if (healer) {
			if (creep.moveTo(healer, pathOptions) !== C.OK) {
				return;
			}
		}
	}

	if (haveAttack) {
		const nearCreep = hostiles.find(ii => creep.pos.isNearTo(ii));
		if (nearCreep) {
			creep.attack(nearCreep);
			return;
		}
	}

	let hasTarget = false;
	for (const options of [
		{ ignoreCreeps: true },
		{ costCallback: costCallbackIgnoreRamparts.bind(null, fortifications) },
		{ ignoreDestructibleStructures: true },
	]) {
		const target = creep.pos.findClosestByPath(hostiles, { ...pathOptions, ...options });
		if (target && (haveAttack || (creep.pos.getRangeTo(target) > 3))) {
			creep.moveTo(target, { ...pathOptions, ...options });
			hasTarget = true;
			break;
		}
	}

	const unreachableSpawns = creep.room.find(C.FIND_HOSTILE_STRUCTURES).filter(structure =>
		structure.structureType === C.STRUCTURE_SPAWN && !checkPath(creep.pos, structure.pos));
	if (!hasTarget && unreachableSpawns.length === 0 && creep.room.controller && creep.room.controller.level > 0) {
		creep.suicide();
		return;
	}

	// With nobody left to chase there's nothing here worth wrecking. Walk up to whatever spawn is
	// walled off, in case its owner comes out, and otherwise wait it out.
	if (!hasTarget) {
		const spawn = unreachableSpawns[0];
		if (spawn) {
			creep.moveTo(spawn, { ...pathOptions, ignoreDestructibleStructures: true });
		}
		return;
	}

	// The path to the victim may run straight through a fortification. Break it down instead of
	// walking into it forever.
	const { _move } = creep.memory as { _move?: SavedMovePath };
	if ((haveAttack || creep.getActiveBodyparts(C.WORK) > 0) && _move?.path !== undefined) {
		const [ pos ] = _move.path;
		if (pos !== undefined) {
			const [ target ] = creep.room.lookForAt(C.LOOK_STRUCTURES, pos.x, pos.y).filter(isRaidTarget);
			if (target) {
				if (creep.getActiveBodyparts(C.RANGED_ATTACK) > 0) {
					creep.rangedAttack(target);
				}
				if (creep.getActiveBodyparts(C.WORK) > 0) {
					creep.dismantle(target);
				} else {
					creep.attack(target);
				}
			}
		}
	}
}
