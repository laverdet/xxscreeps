import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { createRoomObject, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { isBorder } from 'xxscreeps/game/position.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/index.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { roadShape } from './schema.js';

/**
 * Decreases movement cost to 1. Using roads allows creating creeps with less `MOVE` body parts. You
 * can also build roads on top of natural terrain walls which are otherwise impassable.
 * @public
 * @see https://docs.screeps.com/api/#StructureRoad
 */
export class StructureRoad extends withOverlay(Structure, roadShape) {
	/**
	 * The amount of game ticks when this road will lose some hit points.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureRoad.ticksToDecay
	 */
	@enumerable get ticksToDecay() { return requiredExpiryTime(this['#nextDecayTime']); }

	/**
	 * The maximum amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureRoad.hitsMax
	 */
	override get hitsMax() { return C.ROAD_HITS * this['#multiplier']; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureRoad.structureType
	 */
	override get structureType() { return C.STRUCTURE_ROAD; }
	override get '#pathCost'() { return 1; }

	get '#multiplier'() {
		switch (this['#terrain']) {
			case C.TERRAIN_MASK_WALL: return C.CONSTRUCTION_COST_ROAD_WALL_RATIO;
			case C.TERRAIN_MASK_SWAMP: return C.CONSTRUCTION_COST_ROAD_SWAMP_RATIO;
			default: return 1;
		}
	}

	override '#checkObstacle'() {
		return false;
	}
}

export function create(pos: RoomPosition) {
	const road = createRoomObject(new StructureRoad(), pos);
	road['#nextDecayTime'] = Game.time + C.ROAD_DECAY_TIME - 1;
	road['#terrain'] = Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y);
	road.hits = road.hitsMax;
	return road;
}

registerBuildableStructure(C.STRUCTURE_ROAD, {
	obstacle: false,
	stackable: true,
	checkPlacement(room, pos) {
		if (isBorder(pos.x, pos.y)) {
			return null;
		}
		const terrain = room.getTerrain().get(pos.x, pos.y);
		const cost = C.CONSTRUCTION_COST.road;
		switch (terrain) {
			case C.TERRAIN_MASK_SWAMP: return cost * C.CONSTRUCTION_COST_ROAD_SWAMP_RATIO;
			case C.TERRAIN_MASK_WALL: return isBorder(pos.x, pos.y) ? null :
				cost * C.CONSTRUCTION_COST_ROAD_WALL_RATIO;
			default: return cost;
		}
	},
	create(site) {
		return create(site.pos);
	},
});
