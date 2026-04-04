import type { ActionLog } from 'xxscreeps/game/object.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game } from 'xxscreeps/game/index.js';

export function renderActionLog(actionLog: ActionLog, previousTime: number | undefined): Record<string, any> {
	return {
		actionLog: Fn.fromEntries(
			Fn.filter(actionLog, previousTime
				? action => action.time > previousTime :
				action => action.time === Game.time),
			action => [ action.type, { x: action.x, y: action.y } ]),
	};
}
