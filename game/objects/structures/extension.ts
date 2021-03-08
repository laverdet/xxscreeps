import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import * as Structure from '.';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/util/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export function format() { return compose(shape, StructureExtension) }
const shape = declare('Extension', struct(Structure.format, {
	...variant('extension'),
	store: Store.restrictedFormat<'energy'>(),
}));

export class StructureExtension extends withOverlay(Structure.Structure, shape) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_EXTENSION }
}

export function create(pos: RoomPosition, level: number, owner: string) {
	const energyCapacity = C.EXTENSION_ENERGY_CAPACITY[level];
	return assign(RoomObject.create(new StructureExtension, pos), {
		hits: C.EXTENSION_HITS,
		store: Store.create(energyCapacity, { energy: energyCapacity }),
		_owner: owner,
	});
}

registerBuildableStructure(C.STRUCTURE_EXTENSION, site =>
	create(site.pos, site.room.controller?.level ?? 1, site._owner));
