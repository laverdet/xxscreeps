import { declare, optional, vector, ShapeOf } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import { RoomObject } from '~/game/objects/room-object';
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
