import type { TypeOf } from 'xxscreeps/schema';
import { enumeratedForPath } from 'xxscreeps/engine/schema';
import { XSymbol, declare, enumerated, struct, vector } from 'xxscreeps/schema';

export const ActionLog = XSymbol('actionLog');

export function memberFormat() {
	return {
		[ActionLog]: declare('ActionLog', vector(struct({
			action: actions(),
			x: 'int8',
			y: 'int8',
		}))),
	};
}

type Action = TypeOf<typeof actions>;
type WithActionLog = TypeOf<typeof withActionLog>;
export function saveAction(object: WithActionLog, action: Action, x: number, y: number) {
	object[ActionLog].push({ action, x, y });
}

function actions() {
	return enumerated('build', 'upgradeController', ...enumeratedForPath('ActionLog.action'));
}

function withActionLog() {
	return struct(memberFormat());
}
