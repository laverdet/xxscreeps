import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { isBorder } from 'xxscreeps/game/position.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { Structure, checkWall } from 'xxscreeps/mods/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { containerShape } from './schema2.js';
import { OpenStore } from './store.js';

export class StructureContainer extends withOverlay(Structure, containerShape) {
	@enumerable get ticksToDecay() { return requiredExpiryTime(this['#nextDecayTime']); }
	get storeCapacity() { return this.store.getCapacity(); }
	override get hitsMax() { return C.CONTAINER_HITS; }
	override get structureType() { return C.STRUCTURE_CONTAINER; }

	override '#checkObstacle'() {
		return false;
	}
}

export function create(pos: RoomPosition) {
	const ownedController = Game.rooms[pos.roomName]?.controller?.['#user'];
	const container = assign(createRoomObject(new StructureContainer(), pos), {
		hits: C.CONTAINER_HITS,
		store: OpenStore['#create'](C.CONTAINER_CAPACITY),
	});
	container['#nextDecayTime'] =
		Game.time + (ownedController === undefined ? C.CONTAINER_DECAY_TIME : C.CONTAINER_DECAY_TIME_OWNED) - 1;
	return container;
}

registerBuildableStructure(C.STRUCTURE_CONTAINER, {
	obstacle: false,
	checkPlacement(room, pos) {
		if (isBorder(pos.x, pos.y)) {
			return null;
		}
		return checkWall(pos) === C.OK
			? C.CONSTRUCTION_COST.container : null;
	},
	create(site) {
		return create(site.pos);
	},
});
