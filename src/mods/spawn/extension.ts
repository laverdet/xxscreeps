import type { RoomPosition } from 'xxscreeps/game/position.js';
import C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { OwnedStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { SingleStore, singleStoreFormat } from 'xxscreeps/mods/resource/store.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';

export const format = declare('Extension', () => compose(shape, StructureExtension));
const shape = struct(ownedStructureFormat, {
	...variant('extension'),
	hits: 'int32',
	store: singleStoreFormat(),
});

export class StructureExtension extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.EXTENSION_HITS }
	override get structureType() { return C.STRUCTURE_EXTENSION }
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }

	override ['#roomStatusDidChange'](level: number) {
		this.store['#capacity'] = C.EXTENSION_ENERGY_CAPACITY[level];
	}
}

export function create(pos: RoomPosition, level: number, owner: string) {
	const extension = assign(RoomObject.create(new StructureExtension, pos), {
		hits: C.EXTENSION_HITS,
		store: SingleStore['#create'](C.RESOURCE_ENERGY, C.EXTENSION_ENERGY_CAPACITY[level]),
	});
	extension['#user'] = owner;
	return extension;
}

registerBuildableStructure(C.STRUCTURE_EXTENSION, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.extension : null;
	},
	create(site) {
		return create(site.pos, site.room['#level'], site['#user']);
	},
});
