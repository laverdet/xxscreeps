import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/index.js';
import { SingleStore } from 'xxscreeps/mods/classic/resource/store.js';
import { OwnedStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { extensionShape } from './schema.js';

/**
 * Contains energy which can be spent on spawning bigger creeps. Extensions can be placed anywhere
 * in the room, any spawns will be able to use them regardless of distance.
 * @public
 * @see https://docs.screeps.com/api/#StructureExtension
 */
export class StructureExtension extends withOverlay(OwnedStructure, extensionShape) {
	/**
	 * The total amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureExtension.hitsMax
	 */
	override get hitsMax() { return C.EXTENSION_HITS; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureExtension.structureType
	 */
	override get structureType() { return C.STRUCTURE_EXTENSION; }

	/**
	 * An alias for `.store[RESOURCE_ENERGY]`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureExtension.energy
	 */
	get energy() { return this.store[C.RESOURCE_ENERGY]; }

	/**
	 * An alias for `.store.getCapacity(RESOURCE_ENERGY)`. The total amount of energy the extension
	 * can contain.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureExtension.energyCapacity
	 */
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY); }

	override '#roomStatusDidChange'(level: number) {
		this.store['#capacity'] = C.EXTENSION_ENERGY_CAPACITY[level]!;
	}
}

export function create(pos: RoomPosition, level: number, owner: string) {
	const extension = assign(createRoomObject(new StructureExtension(), pos), {
		hits: C.EXTENSION_HITS,
		store: SingleStore['#create'](C.RESOURCE_ENERGY, C.EXTENSION_ENERGY_CAPACITY[level]!),
	});
	extension['#user'] = owner;
	return extension;
}

registerBuildableStructure(C.STRUCTURE_EXTENSION, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.extension : null;
	},
	create(site) {
		return create(site.pos, site.room['#level'], site['#user']);
	},
});
