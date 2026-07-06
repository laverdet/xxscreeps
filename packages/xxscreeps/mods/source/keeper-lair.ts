import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { createRoomObject, optionalExpiryTime } from 'xxscreeps/game/object.js';
import { OwnedStructure } from 'xxscreeps/mods/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { keeperLairShape } from './schema.js';

/**
 * Non-player structure. Spawns NPC Source Keepers that guards energy sources and minerals in some
 * rooms. This structure cannot be destroyed.
 */
export class StructureKeeperLair extends withOverlay(OwnedStructure, keeperLairShape) {
	/**
	 * Time to spawning of the next Source Keeper.
	 */
	@enumerable get ticksToSpawn() { return optionalExpiryTime(this['#nextSpawnTime']); }

	override get structureType() { return C.STRUCTURE_KEEPER_LAIR; }
}

export function create(pos: RoomPosition) {
	const keeperLair = createRoomObject(new StructureKeeperLair(), pos);
	keeperLair['#user'] = '3';
	return keeperLair;
}
