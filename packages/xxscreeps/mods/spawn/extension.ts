import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { SingleStore } from 'xxscreeps/mods/resource/store.js';
import { OwnedStructure, checkPlacement } from 'xxscreeps/mods/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { extensionShape } from './schema.js';

export class StructureExtension extends withOverlay(OwnedStructure, extensionShape) {
	override get hitsMax() { return C.EXTENSION_HITS; }
	override get structureType() { return C.STRUCTURE_EXTENSION; }
	get energy() { return this.store[C.RESOURCE_ENERGY]; }
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
