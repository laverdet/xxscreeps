import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { StructureRoad } from './road';

registerObjectTickProcessor(StructureRoad, (road, context) => {
	if (road.ticksToDecay === 0) {
		road.hits -= C.ROAD_DECAY_AMOUNT * road['#multiplier'];
		if (road.hits <= 0) {
			road.room['#removeObject'](road);
		}
		road['#nextDecayTime'] = Game.time + C.ROAD_DECAY_TIME - 1;
		context.didUpdate();
	}
	context.wakeAt(road['#nextDecayTime']);
});
