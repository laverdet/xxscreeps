import * as C from './constants';
import { bindEventRenderer } from 'xxscreeps/backend';
import * as Game from 'xxscreeps/game/game';

bindEventRenderer(C.EVENT_HARVEST, event => {
	const target = Game.getObjectById(event.targetId);
	if (target) {
		return {
			[event.objectId]: {
				actionLog: {
					harvest: { x: target.pos.x, y: target.pos.y },
				},
			},
		};
	}
});
