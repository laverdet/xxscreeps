import type { Room } from 'xxscreeps/game/room';
import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import { OwnedStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const format = () => compose(shape, StructureExtension);
const shape = declare('Extension', struct(ownedStructureFormat, {
	...variant('extension'),
	hits: 'int32',
	store: Store.restrictedFormat<'energy'>(),
}));

export class StructureExtension extends withOverlay(OwnedStructure, shape) {
	get energy() { return this.store[C.RESOURCE_ENERGY] }
	get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get hitsMax() { return C.EXTENSION_HITS }
	get structureType() { return C.STRUCTURE_EXTENSION }

	['#afterInsert'](room: Room) {
		super['#afterInsert'](room);
		room.energyAvailable += this.store[C.RESOURCE_ENERGY];
		room.energyCapacityAvailable += this.store.getCapacity(C.RESOURCE_ENERGY);
	}

	['#afterRemove'](room: Room) {
		super['#afterRemove'](room);
		room.energyAvailable -= this.store[C.RESOURCE_ENERGY];
		room.energyCapacityAvailable -= this.store.getCapacity(C.RESOURCE_ENERGY);
	}
}

export function create(pos: RoomPosition, level: number, owner: string) {
	const energyCapacity = C.EXTENSION_ENERGY_CAPACITY[level];
	const extension = assign(RoomObject.create(new StructureExtension, pos), {
		hits: C.EXTENSION_HITS,
		store: Store.create(energyCapacity, { energy: energyCapacity }),
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
		return create(site.pos, site.room.controller?.level ?? 1, site['#user']);
	},
});
