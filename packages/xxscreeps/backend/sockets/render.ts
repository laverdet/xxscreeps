import type { ActionLog, ActionLogType } from 'xxscreeps/game/object.js';
import { bindRenderer } from 'xxscreeps/backend/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { Variant } from 'xxscreeps/schema/index.js';

interface CoordinatesObject {
	x: number;
	y: number;
}

type RenderedActionLog = Partial<Record<ActionLogType, CoordinatesObject>>;

// Base object renderer
bindRenderer(RoomObject, object => {
	if (object['#lookType'] !== null) {
		return {
			_id: object.id,
			type: object[Variant as never],
			x: object.pos.x,
			y: object.pos.y,
		};
	}
});

export function renderActionLog(actionLog: ActionLog, previousTime: number | undefined): RenderedActionLog {
	return Fn.pipe(
		actionLog,
		$$ => Fn.filter($$, previousTime === undefined
			? action => action.time === Game.time
			: action => action.time > previousTime),
		$$ => Fn.fromEntries($$, action => [ action.type, { x: action.x, y: action.y } ]));
}
