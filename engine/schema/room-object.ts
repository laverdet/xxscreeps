import { declare, optional, vector, ShapeOf } from 'xxscreeps/schema';
import * as Id from 'xxscreeps/engine/util/schema/id';
import { RoomObject } from 'xxscreeps/game/objects/room-object';
import * as RoomPosition from './position';

export type Shape = ShapeOf<typeof shape>;
const shape = declare('RoomObject', {
	id: Id.format,
	pos: RoomPosition.format,
	effects: optional(vector({
		effect: 'uint16',
		expireTime: 'uint32',
		level: 'uint16',
	})),
});

export const format = declare(shape, { overlay: RoomObject });
