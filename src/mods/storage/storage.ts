import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import { Structure, checkPlacement, structureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const format = () => compose(shape, StructureStorage);
const shape = declare('Storage', struct(structureFormat, {
	...variant('storage'),
	store: Store.format,
}));

export class StructureStorage extends withOverlay(Structure, shape) {
	get structureType() { return C.STRUCTURE_STORAGE }
}

export function create(pos: RoomPosition, owner: string) {
	return assign(RoomObject.create(new StructureStorage, pos), {
		hits: C.STORAGE_HITS,
		store: Store.create(C.STORAGE_CAPACITY),
		[RoomObject.Owner]: owner,
	});
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_STORAGE, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.storage : null;
	},
	create(site) {
		return create(site.pos, site.owner);
	},
});
