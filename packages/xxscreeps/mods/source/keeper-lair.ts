import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { OwnedStructure, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';

export const format = declare('KeeperLair', () => compose(shape, StructureKeeperLair));
const shape = struct(ownedStructureFormat, {
	...variant('keeperLair'),
	'#nextSpawnTime': 'int32',
});

/**
 * Non-player structure. Spawns NPC Source Keepers that guards energy sources and minerals in some
 * rooms. This structure cannot be destroyed.
 */
export class StructureKeeperLair extends withOverlay(OwnedStructure, shape) {
	/**
	 * Time to spawning of the next Source Keeper.
	 */
	@enumerable get ticksToSpawn() {
		const nextSpawnTime = this['#nextSpawnTime'];
		return nextSpawnTime ? Math.max(0, nextSpawnTime - Game.time) : undefined;
	}

	override get structureType() { return C.STRUCTURE_KEEPER_LAIR; }
}

export function create(pos: RoomPosition) {
	const keeperLair = RoomObject.create(new StructureKeeperLair(), pos);
	keeperLair['#user'] = '3';
	return keeperLair;
}

// Export `StructureKeeperLair` to runtime globals
registerGlobal(StructureKeeperLair);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureKeeperLair: typeof StructureKeeperLair }
}
