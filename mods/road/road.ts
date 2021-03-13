import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as RoomObject from 'xxscreeps/game/object';
import * as Structure from 'xxscreeps/mods/structure/structure';
import { RoomPosition, isBorder } from 'xxscreeps/game/position';
import { compose, declare, member, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';

export const NextDecayTime = Symbol('nextDecayTime');

export function format() { return compose(shape, StructureRoad) }
const shape = declare('Road', struct(Structure.format, {
	...variant('road'),
	nextDecayTime: member(NextDecayTime, 'int32'),
}));

export class StructureRoad extends withOverlay(Structure.Structure, shape) {
	get structureType() { return C.STRUCTURE_ROAD }
	get ticksToDecay() { return Math.max(0, this[NextDecayTime] - Game.time) }
	get [RoomObject.PathCost]() { return 1 }

	[Structure.CheckObstacle]() {
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
