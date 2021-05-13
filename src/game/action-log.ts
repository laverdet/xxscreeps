import type { TypeOf } from 'xxscreeps/schema';
import { enumeratedForPath } from 'xxscreeps/engine/schema';
import { declare, enumerated, struct, vector } from 'xxscreeps/schema';

export function memberFormat() {
	return {
		'#actionLog': declare('ActionLog', vector(struct({
			action: actions(),
			x: 'int8',
			y: 'int8',
		}))),
	};
}

type Action = TypeOf<typeof actions>;
type WithActionLog = TypeOf<typeof withActionLog>;
export function saveAction(object: WithActionLog, action: Action, x: number, y: number) {
	object['#actionLog'].push({ action, x, y });
}

function actions() {
	return enumerated('build', 'upgradeController', ...enumeratedForPath('ActionLog.action'));
}

function withActionLog() {
	return struct(memberFormat());
}
