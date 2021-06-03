import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game, registerGlobal } from 'xxscreeps/game';
import { OwnedStructure, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';

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
	get structureType() { return C.STRUCTURE_KEEPER_LAIR }

	/**
	 * Time to spawning of the next Source Keeper.
	 */
	get ticksToSpawn() {
		const nextSpawnTime = this['#nextSpawnTime'];
		return nextSpawnTime ? Math.max(0, nextSpawnTime - Game.time) : undefined;
	}
}

export function create(pos: RoomPosition) {
	const keeperLair = RoomObject.create(new StructureKeeperLair, pos);
	keeperLair['#user'] = '3';
	return keeperLair;
}

// Export `StructureKeeperLair` to runtime globals
registerGlobal(StructureKeeperLair);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureKeeperLair: typeof StructureKeeperLair }
}
