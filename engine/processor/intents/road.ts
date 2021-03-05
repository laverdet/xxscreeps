import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import * as Map from 'xxscreeps/game/map';
import type { RoomPosition } from 'xxscreeps/game/position';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { instantiate } from 'xxscreeps/util/utility';
import { newRoomObject } from './room-object';
import { NextDecayTime, StructureRoad } from 'xxscreeps/game/objects/structures/road';

export function create(pos: RoomPosition) {
	return instantiate(StructureRoad, {
		...newRoomObject(pos),
		hits: C.ROAD_HITS,
		[NextDecayTime]: Game.time + C.ROAD_DECAY_TIME,
		_owner: undefined,
	});
}

registerObjectTickProcessor(StructureRoad, road => {
	if (road.ticksToDecay === 0) {
		const { pos } = road;
		const terrain = Map.getTerrainForRoom(pos.roomName).get(pos.x, pos.y);
		const decayMultiplier =
			terrain === C.TERRAIN_MASK_WALL ? C.CONSTRUCTION_COST_ROAD_WALL_RATIO :
			terrain === C.TERRAIN_MASK_SWAMP ? C.CONSTRUCTION_COST_ROAD_SWAMP_RATIO :
			1;
			road.hits -= C.ROAD_DECAY_AMOUNT * decayMultiplier;
			road[NextDecayTime] = Game.time + C.ROAD_DECAY_TIME;
	}
	return true;
});
