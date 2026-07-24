import type { RoomPosition } from 'xxscreeps/game/position.js';
import { Game } from 'xxscreeps/game/index.js';
import { createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { isBorder } from 'xxscreeps/game/position.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { Structure, checkWall } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { containerShape } from './schema.js';
import { OpenStore } from './store.js';

/**
 * A small container that can be used to store resources. This is a walkable structure. All dropped
 * resources automatically goes to the container at the same tile.
 * @public
 * @see https://docs.screeps.com/api/#StructureContainer
 */
export class StructureContainer extends withOverlay(Structure, containerShape) {
	/**
	 * The amount of game ticks when this container will lose some hit points.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureContainer.ticksToDecay
	 */
	@enumerable get ticksToDecay() { return requiredExpiryTime(this['#nextDecayTime']); }

	/**
	 * Alias for `.store.getCapacity()`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureContainer.storeCapacity
	 */
	get storeCapacity() { return this.store.getCapacity(); }

	/**
	 * The maximum amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureContainer.hitsMax
	 */
	override get hitsMax() { return C.CONTAINER_HITS; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureContainer.structureType
	 */
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
