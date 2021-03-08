import type { Room } from 'xxscreeps/game/room';
import type { LookConstants } from 'xxscreeps/game/room/look';
import * as Id from 'xxscreeps/engine/schema/id';
import * as RoomPosition from 'xxscreeps/game/position';
import { compose, declare, optional, struct, vector, withOverlay } from 'xxscreeps/schema';
import { BufferObject } from 'xxscreeps/schema/buffer-object';
import { expandGetters } from 'xxscreeps/engine/util/inspect';
import { IntentIdentifier } from 'xxscreeps/processor/symbols';
import { assign } from 'xxscreeps/util/utility';

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

export abstract class RoomObject extends withOverlay(BufferObject, shape) {
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

export function create<Type extends RoomObject>(instance: Type, pos: RoomPosition.RoomPosition): Type {
	return assign<Type, RoomObject>(instance, {
		id: Id.generateId(),
		pos,
	});
}
