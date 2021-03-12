import type { Room } from 'xxscreeps/game/room';
import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import * as Structure from '../structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const format = () => compose(shape, StructureExtension);
const shape = declare('Extension', struct(Structure.format, {
	...variant('extension'),
	store: Store.restrictedFormat<'energy'>(),
}));

export class StructureExtension extends withOverlay(Structure.Structure, shape) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_EXTENSION }

	[RoomObject.AfterInsert](room: Room) {
		super[RoomObject.AfterInsert](room);
		room.energyAvailable += this.store[C.RESOURCE_ENERGY];
		room.energyCapacityAvailable += this.store.getCapacity(C.RESOURCE_ENERGY);
	}
	[RoomObject.AfterRemove](room: Room) {
		super[RoomObject.AfterRemove](room);
		room.energyAvailable -= this.store[C.RESOURCE_ENERGY];
		room.energyCapacityAvailable -= this.store.getCapacity(C.RESOURCE_ENERGY);
	}
}

export function create(pos: RoomPosition, level: number, owner: string) {
	const energyCapacity = C.EXTENSION_ENERGY_CAPACITY[level];
	return assign(RoomObject.create(new StructureExtension, pos), {
		hits: C.EXTENSION_HITS,
		store: Store.create(energyCapacity, { energy: energyCapacity }),
		[RoomObject.Owner]: owner,
	});
}

registerBuildableStructure(C.STRUCTURE_EXTENSION, site =>
	create(site.pos, site.room.controller?.level ?? 1, site.owner));
