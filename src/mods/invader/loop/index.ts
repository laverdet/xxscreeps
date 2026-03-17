import type { GameConstructor } from 'xxscreeps/game/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import findAttack from './find-attack.js';
import healer from './healer.js';
import shootAtWill from './shoot-at-will.js';

export function loop(Game: GameConstructor) {
	const creeps = Object.values(Game.creeps);
	const room = creeps[0]?.room;

	if (!room) {
		return false;
	}
	const healers = creeps.filter(
		creep => creep.getActiveBodyparts(C.HEAL) > 0);
	const fortifications = room.find(C.FIND_HOSTILE_STRUCTURES).filter(structure =>
		structure.structureType === C.STRUCTURE_RAMPART ||
		structure.structureType === C.STRUCTURE_WALL);
	// TODO: Filter SK
	const hostiles = room.find(C.FIND_HOSTILE_CREEPS);

	for (const creep of Object.values(Game.creeps)) {
		if (creep.getActiveBodyparts('heal') > 0) {
			healer(creep, healers);
		} else {
			findAttack(creep, healers, hostiles, fortifications);
		}
		shootAtWill(creep);
	}
	return true;
}
