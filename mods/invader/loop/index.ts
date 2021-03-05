import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import healer from './healer';
import findAttack from './find-attack';
import shootAtWill from './shoot-at-will';

export function loop() {
	const creeps = Object.values(Game.creeps);
	const room = creeps[0]?.room;
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!room) {
		return false;
	}
	const healers = creeps.filter(
		creep => creep.getActiveBodyparts(C.HEAL) > 0);
	const fortifications = room.find(C.FIND_HOSTILE_STRUCTURES).filter(structure =>
		// @ts-expect-error
		structure.structureType === C.STRUCTURE_RAMPART ||
		// @ts-expect-error
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
