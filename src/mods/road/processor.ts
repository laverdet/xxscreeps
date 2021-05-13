import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { StructureRoad } from './road';

registerObjectTickProcessor(StructureRoad, (road, context) => {
	if (road.ticksToDecay === 0) {
		const { pos } = road;
		const terrain = Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y);
		const decayMultiplier =
			terrain === C.TERRAIN_MASK_WALL ? C.CONSTRUCTION_COST_ROAD_WALL_RATIO :
			terrain === C.TERRAIN_MASK_SWAMP ? C.CONSTRUCTION_COST_ROAD_SWAMP_RATIO :
			1;
		road.hits -= C.ROAD_DECAY_AMOUNT * decayMultiplier;
		road['#nextDecayTime'] = Game.time + C.ROAD_DECAY_TIME;
		context.didUpdate();
	}
	context.wakeAt(road['#nextDecayTime']);
});
