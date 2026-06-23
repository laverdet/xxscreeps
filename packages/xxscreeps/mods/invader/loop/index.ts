import type { StructureInvaderCore } from '../invader-core.js';
import type { GameConstructor } from 'xxscreeps/game/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import findAttack from './find-attack.js';
import healer from './healer.js';
import shootAtWill from './shoot-at-will.js';

// Stronghold-template behaviors (refillTowers, refillCreeps, focusClosest) depend on a
// deployed stronghold's towers/ramparts, which aren't implemented yet. Only the controller
// driver lives here for now.
function handleController(core: StructureInvaderCore) {
	const controller = core.room.controller;
	if (!controller) {
		return;
	}
	if (controller['#user'] === '2' && controller.level > 0) {
		if ((controller.ticksToDowngrade ?? Infinity) < C.INVADER_CORE_CONTROLLER_DOWNGRADE - 25) {
			core['#upgradeController'](controller);
		}
		return;
	}
	const reserved = controller['#reservationEndTime'] > Game.time;
	if (!reserved || controller.room['#user'] === '2') {
		core['#reserveController'](controller);
	} else {
		core['#attackController'](controller);
	}
}

export function loop(Game: GameConstructor) {
	const room = Object.values(Game.rooms)[0];
	if (!room) {
		return false;
	}

	// Drive invader cores
	const cores = Object.values(Game.structures).filter(
		(structure): structure is StructureInvaderCore =>
			structure.structureType === C.STRUCTURE_INVADER_CORE);
	for (const core of cores) {
		handleController(core);
	}

	// Drive invader creeps
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

	return cores.length > 0 || creeps.length > 0;
}
