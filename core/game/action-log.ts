import { enumeratedForPath } from 'xxscreeps/engine/schema';
import { declare, enumerated, member, struct, vector, TypeOf } from 'xxscreeps/schema';

export const ActionLog = Symbol('actionLog');

export function memberFormat() {
	return {
		actionLog: member(ActionLog,
			declare('ActionLog', vector(struct({
				action: actions(),
				x: 'int8',
				y: 'int8',
			})),
		)),
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
