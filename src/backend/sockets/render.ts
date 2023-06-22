import type { ActionLog } from 'xxscreeps/game/object.js';
import Fn from 'xxscreeps/utility/functional.js';
import { bindRenderer } from 'xxscreeps/backend/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { Variant } from 'xxscreeps/schema/index.js';

// Base object renderer
bindRenderer(RoomObject, object => ({
	_id: object.id,
	type: object[Variant as never],
	x: object.pos.x,
	y: object.pos.y,
}));

export function renderActionLog(actionLog: ActionLog, previousTime: number | undefined): Record<string, any> {
	return {
		actionLog: Fn.fromEntries(
			Fn.filter(actionLog, previousTime ?
				action => action.time > previousTime :
				action => action.time === Game.time),
			action => [ action.type, { x: action.x, y: action.y } ]),
	};
}
