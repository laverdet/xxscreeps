import C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { StructureRoad } from './road.js';

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
