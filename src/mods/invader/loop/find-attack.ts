import type * as PathFinder from 'xxscreeps/game/path-finder';
import * as C from 'xxscreeps/game/constants';
import type { RoomPosition } from 'xxscreeps/game/position';
import type { Creep } from 'xxscreeps/mods/creep/creep';
import type { Structure } from 'xxscreeps/mods/structure/structure';
import flee from './flee';

function checkPath(pos1: RoomPosition, pos2: RoomPosition) {
	const path = pos1.findPathTo(pos2, { maxRooms: 1 });
	if (path.length === 0) {
		return false;
	}
	return pos2.isNearTo(path[path.length - 1].x, path[path.length - 1].y);
}

function costCallbackIgnoreRamparts(fortifications: Structure[], roomName: string, cm: PathFinder.CostMatrix) {
	fortifications.forEach(ii => cm.set(ii.pos.x, ii.pos.y, 0));
}

const pathOptions = { maxRoads: 1, maxRooms: 1, ignoreRoads: true, serializeMemory: false };
export default function(creep: Creep, healers: Creep[], hostiles: Creep[], fortifications: Structure[]) {
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
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (target) {
		creep.moveTo(target, { ...pathOptions, ignoreDestructibleStructures: true });
		return;
	}

	if ((haveAttack || creep.getActiveBodyparts(C.WORK) > 0) && creep.memory._move?.path !== undefined) {
		if (creep.memory._move.path.length === 0) {
			return;
		}

		const pos = creep.memory._move.path[0];
		const structures = creep.room.lookForAt(C.LOOK_STRUCTURES, pos.x, pos.y).filter(
			look => look.structureType !== 'spawn');
		if (structures.length > 0) {
			if (creep.getActiveBodyparts(C.WORK) > 0) {
				// creep.dismantle(structures[0].structure);
			} else {
				creep.attack(structures[0]);
			}
		}
	}
}
