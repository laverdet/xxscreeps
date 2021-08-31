import type { Room } from 'xxscreeps/game/room';
import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { OwnedStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { OpenStore, openStoreFormat } from 'xxscreeps/mods/resource/store';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const format = () => compose(shape, StructureStorage);
const shape = declare('Storage', struct(ownedStructureFormat, {
	...variant('storage'),
	hits: 'int32',
	store: openStoreFormat,
}));

export class StructureStorage extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.STORAGE_HITS }
	override get structureType() { return C.STRUCTURE_STORAGE }

	override ['#afterInsert'](room: Room) {
		super['#afterInsert'](room);
		room.storage = this;
	}

	override ['#beforeRemove']() {
		this.room.storage = undefined;
		super['#beforeRemove']();
	}
}

export function create(pos: RoomPosition, owner: string) {
	const storage = assign(RoomObject.create(new StructureStorage, pos), {
		hits: C.STORAGE_HITS,
		store: OpenStore['#create'](C.STORAGE_CAPACITY),
	});
	storage['#user'] = owner;
	return storage;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_STORAGE, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.storage : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

declare module 'xxscreeps/game/room' {
	interface Room {
		storage: StructureStorage | undefined;
	}
}
