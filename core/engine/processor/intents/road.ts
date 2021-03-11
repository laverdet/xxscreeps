import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Map from 'xxscreeps/game/map';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { NextDecayTime, StructureRoad } from 'xxscreeps/game/objects/structures/road';

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
