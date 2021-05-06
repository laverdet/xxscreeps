import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game } from 'xxscreeps/game';
import { isBorder } from 'xxscreeps/game/position';
import { CheckObstacle, Structure, structureFormat } from 'xxscreeps/mods/structure/structure';
import { XSymbol, compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const NextDecayTime = XSymbol('nextDecayTime');

export function format() { return compose(shape, StructureRoad) }
const shape = declare('Road', struct(structureFormat, {
	...variant('road'),
	[NextDecayTime]: 'int32',
}));

export class StructureRoad extends withOverlay(Structure, shape) {
	get structureType() { return C.STRUCTURE_ROAD }
	get ticksToDecay() { return Math.max(0, this[NextDecayTime] - Game.time) }
	get [RoomObject.PathCost]() { return 1 }

	[CheckObstacle]() {
		return false;
	}
}

export function create(pos: RoomPosition) {
	return assign(RoomObject.create(new StructureRoad, pos), {
		hits: C.ROAD_HITS,
		[NextDecayTime]: Game.time + C.ROAD_DECAY_TIME,
	});
}

registerBuildableStructure(C.STRUCTURE_ROAD, {
	obstacle: false,
	checkPlacement(room, pos) {
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
