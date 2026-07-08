import type { StructureInvaderCore } from '../invader-core.js';
import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { StructureRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
import type { StructureTower } from 'xxscreeps/mods/classic/defense/tower.js';
import * as C from 'xxscreeps/game/constants/index.js';
import findAttack from './find-attack.js';
import healer from './healer.js';
import shootAtWill from './shoot-at-will.js';
import { strongholdBehavior } from './stronghold.js';

export function loop(Game: GameConstructor) {
	const room = Object.values(Game.rooms)[0];
	if (!room) {
		return false;
	}

	const creeps = Object.values(Game.creeps);
	const structures = Object.values(Game.structures);
	const cores = structures.filter(
		(structure): structure is StructureInvaderCore =>
			structure.structureType === C.STRUCTURE_INVADER_CORE);

	// A room with an invader core is a stronghold; its creeps are defenders driven by the core's
	// behavior rather than the raid logic below.
	if (cores.length > 0) {
		const context = {
			defenders: creeps.filter(creep => !creep.spawning),
			hostiles: room.find(C.FIND_HOSTILE_CREEPS).filter(creep => creep['#user'] !== '3'),
			towers: structures.filter(
				(structure): structure is StructureTower => structure.structureType === C.STRUCTURE_TOWER),
			ramparts: structures.filter(
				(structure): structure is StructureRampart => structure.structureType === C.STRUCTURE_RAMPART),
		};
		for (const core of cores) {
			strongholdBehavior(core)({ core, ...context });
		}
		return true;
	}

	// Drive invader raid creeps
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
