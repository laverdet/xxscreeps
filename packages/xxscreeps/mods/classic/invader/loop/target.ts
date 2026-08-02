import type { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import * as C from 'xxscreeps:mods/constants';

/**
 * A raid is meant to bleed a room, not to end it. Invaders tear down whatever a player built in
 * their way, but the spawn itself is off limits so the room can always recover.
 */
export function isRaidTarget(structure: Structure) {
	return structure.structureType !== C.STRUCTURE_SPAWN &&
		structure.structureType in C.CONTROLLER_STRUCTURES;
}
