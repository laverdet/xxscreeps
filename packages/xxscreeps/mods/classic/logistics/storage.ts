import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { OpenStore } from 'xxscreeps/mods/classic/resource/store.js';
import { OwnedStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { storageShape } from './schema.js';

/**
 * A structure that can store huge amount of resource units. Only one structure per room is allowed
 * that can be addressed by [`Room.storage`](https://docs.screeps.com/api/#Room.storage) property.
 * @public
 * @see https://docs.screeps.com/api/#StructureStorage
 */
export class StructureStorage extends withOverlay(OwnedStructure, storageShape) {
	override get hitsMax() { return C.STORAGE_HITS; }
	override get structureType() { return C.STRUCTURE_STORAGE; }

	/**
	 * An alias for [`.store.getCapacity()`](https://docs.screeps.com/api/#Store.getCapacity).
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureStorage.storeCapacity
	 */
	@enumerable get storeCapacity() { return this.store.getCapacity(); }

	override '#afterRemove'() {
		this.room.storage = undefined;
		super['#afterRemove']();
	}

	override '#beforeInsert'(room: Room) {
		super['#beforeInsert'](room);
		room.storage = this;
	}
}

export function create(pos: RoomPosition, owner: string) {
	const storage = assign(createRoomObject(new StructureStorage(), pos), {
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
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.storage : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		/**
		 * The Storage structure of this room, if present, otherwise undefined.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.storage
		 */
		storage: StructureStorage | undefined;
	}
}
