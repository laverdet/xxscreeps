import * as C from '~/game/constants';
import type { LookConstants, Room } from '~/game/room';
import { Process, ProcessorSpecification, Tick } from '~/engine/processor/bind';
import { expandGetters } from '~/engine/util/inspect';
import { BufferObject } from '~/lib/schema/buffer-object';
import { withOverlay, Variant } from '~/lib/schema';
import type { Shape } from '~/engine/schema/room-object';

export abstract class RoomObject extends withOverlay<Shape>()(BufferObject) {
	abstract _lookType: LookConstants;

	[Symbol.for('nodejs.util.inspect.custom')]() {
		return expandGetters(this);
	}

	room!: Room;
	_owner?: string;
	[Process]?: ProcessorSpecification<this>['process'];
	[Tick]?: ProcessorSpecification<this>['tick'];
	[Variant]: string;
}

export function chainIntentChecks<Checks extends (() => C.ErrorCode)[]>(...checks: Checks):
Checks extends (() => infer Codes)[] ? Codes | typeof C.OK : C.ErrorCode {
	for (const check of checks) {
		const result = check();
		if (result !== C.OK) {
			return result as any;
		}
	}
	return C.OK as any;
}
