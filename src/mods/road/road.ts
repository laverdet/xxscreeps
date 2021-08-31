import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game } from 'xxscreeps/game';
import { isBorder } from 'xxscreeps/game/position';
import { Structure, structureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const format = declare('Road', () => compose(shape, StructureRoad));
const shape = struct(structureFormat, {
	...variant('road'),
	hits: 'int32',
	'#nextDecayTime': 'int32',
	'#terrain': 'int8',
});

export class StructureRoad extends withOverlay(Structure, shape) {
	override get hitsMax() { return C.ROAD_HITS * this['#multiplier'] }
	override get structureType() { return C.STRUCTURE_ROAD }
	override get ['#pathCost']() { return 1 }
	@enumerable get ticksToDecay() { return Math.max(0, this['#nextDecayTime'] - Game.time) }

	get ['#multiplier']() {
		switch (this['#terrain']) {
			case C.TERRAIN_MASK_WALL: return C.CONSTRUCTION_COST_ROAD_WALL_RATIO;
			case C.TERRAIN_MASK_SWAMP: return C.CONSTRUCTION_COST_ROAD_SWAMP_RATIO;
			default: return 1;
		}
	}

	override ['#checkObstacle']() {
		return false;
	}
}

export function create(pos: RoomPosition) {
	const road = RoomObject.create(new StructureRoad, pos);
	road['#nextDecayTime'] = Game.time + C.ROAD_DECAY_TIME - 1;
	road['#terrain'] = Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y);
	road.hits = road.hitsMax;
	return road;
}

registerBuildableStructure(C.STRUCTURE_ROAD, {
	obstacle: false,
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
