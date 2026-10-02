import { registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { expiresNextTick } from 'xxscreeps/game/object.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureRoad } from './road.js';

registerObjectTickProcessor(StructureRoad, (road, context) => {
	if (expiresNextTick(road['#nextDecayTime'])) {
		road.hits -= C.ROAD_DECAY_AMOUNT * road['#multiplier'];
		if (road.hits <= 0) {
			road.room['#removeObject'](road);
		}
		road['#nextDecayTime'] = Game.time + C.ROAD_DECAY_TIME;
		context.didUpdate();
	}
	context.wakeAt(road['#nextDecayTime']);
});
