import type { Room } from 'xxscreeps/game/room';
import type { LookConstants } from 'xxscreeps/game/room/look';
import { compose, declare, optional, struct, vector, withOverlay } from 'xxscreeps/schema';
import { BufferObject } from 'xxscreeps/schema/buffer-object';
import * as Id from 'xxscreeps/engine/util/schema/id';
import * as RoomPosition from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import { expandGetters } from 'xxscreeps/engine/util/inspect';
import { IntentIdentifier } from 'xxscreeps/processor/symbols';

export function format() { return compose(shape, RoomObject) }
const shape = declare('RoomObject', struct({
	id: Id.format,
	pos: RoomPosition.format,
	effects: optional(vector(struct({
		effect: 'uint16',
		expireTime: 'uint32',
		level: 'uint16',
	}))),
}));

export abstract class RoomObject extends withOverlay(shape)(BufferObject) {
	abstract _lookType: LookConstants;
	room!: Room;
	_owner?: string | null;

	[Symbol.for('nodejs.util.inspect.custom')]() {
		return expandGetters(this);
	}

	get [IntentIdentifier]() {
		return { group: this.room.name, name: this.id };
	}
}

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
