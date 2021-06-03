import type { ActionLog } from 'xxscreeps/game/object';
import type { ObjectProcessorContext } from './room';
import * as Fn from 'xxscreeps/utility/functional';
import { Game } from 'xxscreeps/game';
import { filterInPlace } from 'xxscreeps/utility/utility';

export function flushActionLog(actionLog: ActionLog, context: ObjectProcessorContext) {
	const kRetainActionsTime = 10;
	const timeLimit = Game.time - kRetainActionsTime;

	const length = actionLog.length;
	if (length > 0) {
		filterInPlace(actionLog, action => action.time > timeLimit);
		if (actionLog.length !== length) {
			context.didUpdate();
		}
		if (actionLog.length > 0) {
			const minimum = Fn.minimum(Fn.map(actionLog, action => action.time))!;
			context.wakeAt(minimum + kRetainActionsTime);
		}
	}
}
