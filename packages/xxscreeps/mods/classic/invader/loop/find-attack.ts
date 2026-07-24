import type * as PathFinder from 'xxscreeps/game/pathfinder/index.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { Creep, SavedMovePath } from 'xxscreeps/mods/classic/creep/creep.js';
import type { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import * as C from 'xxscreeps:mods/constants';
import flee from './flee.js';

function checkPath(pos1: RoomPosition, pos2: RoomPosition) {
	const target = pos1.findPathTo(pos2, { maxRooms: 1 }).at(-1);
	if (target === undefined) {
		return false;
	} else {
		return pos1.isNearTo(target.x, target.y);
	}
}

function costCallbackIgnoreRamparts(fortifications: Structure[], roomName: string, cm: PathFinder.CostMatrix): undefined {
	fortifications.forEach(ii => cm.set(ii.pos.x, ii.pos.y, 0));
}

const pathOptions = { maxRoads: 1, maxRooms: 1, ignoreRoads: true, serializeMemory: false };
export default function findAttack(creep: Creep, healers: Creep[], hostiles: Creep[], fortifications: Structure[]) {
	const haveAttack = creep.getActiveBodyparts(C.ATTACK) > 0;
	if (!haveAttack && creep.getActiveBodyparts(C.RANGED_ATTACK) === 0 && flee(creep, 3)) {
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

	const target = unreachableSpawns[0];
	if (target) {
		creep.moveTo(target, { ...pathOptions, ignoreDestructibleStructures: true });
		return;
	}

	const { _move } = creep.memory as { _move?: SavedMovePath };
	if ((haveAttack || creep.getActiveBodyparts(C.WORK) > 0) && _move?.path !== undefined) {
		const [ pos ] = _move.path;
		if (pos !== undefined) {
			const [ target ] = creep.room.lookForAt(C.LOOK_STRUCTURES, pos.x, pos.y).filter(
				look => look.structureType !== 'spawn');
			if (target) {
				if (creep.getActiveBodyparts(C.WORK) > 0) {
					// creep.dismantle(target);
				} else {
					creep.attack(target);
				}
			}
		}
	}
}
