import type { Room } from './room';
import type { RoomObject } from './objects/room-object';
import * as C from './constants';

export function chainIntentChecks<Checks extends (() => C.ErrorCode)[]>(...checks: Checks):
Checks extends (() => infer Codes)[] ? Codes : C.ErrorCode {
	for (const check of checks) {
		const result = check();
		if (result !== C.OK) {
			return result as any;
		}
	}
	return C.OK as any;
}

export function checkRange(actor: RoomObject, target: RoomObject, range: number) {
	if (actor.pos.inRangeTo(target, range)) {
		return C.OK;
	}
	return C.ERR_NOT_IN_RANGE;
}

export function checkSafeMode<Error extends number>(room: Room, error: Error) {
	if (room.controller?.safeMode && !room.controller.my) {
		return error;
	}
	return C.OK;
}

export function checkTarget(target: RoomObject | undefined, types: any[] = []) {
	if (target) {
		for (const type of types) {
			if (target instanceof type) {
				return C.OK;
			}
		}
	}
	return C.ERR_INVALID_TARGET;
}
