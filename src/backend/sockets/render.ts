import type { ActionLog } from 'xxscreeps/game/object';
import * as Fn from 'xxscreeps/utility/functional';
import { bindRenderer } from 'xxscreeps/backend';
import { Game } from 'xxscreeps/game';
import { RoomObject } from 'xxscreeps/game/object';
import { Variant } from 'xxscreeps/schema';

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
