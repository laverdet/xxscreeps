import type { GameConstructor } from 'xxscreeps/game/index.js';
import * as C from 'xxscreeps:mods/constants';
import findAttack from './find-attack.js';
import healer from './healer.js';
import shootAtWill from './shoot-at-will.js';

export function loop(Game: GameConstructor) {
	const room = Object.values(Game.rooms)[0];
	if (!room) {
		return false;
	}

	// Drive invader raid creeps
	const creeps = Object.values(Game.creeps);
	if (creeps.length > 0) {
		const healers = creeps.filter(
			creep => creep.getActiveBodyparts(C.HEAL) > 0);
		const fortifications = room.find(C.FIND_HOSTILE_STRUCTURES).filter(structure =>
			structure.structureType === C.STRUCTURE_RAMPART ||
			structure.structureType === C.STRUCTURE_WALL);
		// TODO: Filter SK
		const hostiles = room.find(C.FIND_HOSTILE_CREEPS);

		for (const creep of creeps) {
			if (creep.getActiveBodyparts('heal') > 0) {
				healer(creep, healers);
			} else {
				findAttack(creep, healers, hostiles, fortifications);
			}
			shootAtWill(creep);
		}
	}

	return creeps.length > 0;
}
