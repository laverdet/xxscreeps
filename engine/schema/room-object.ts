import { bindInterceptors, bindName, makeOptional, makeVector } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import { RoomObject } from '~/game/objects/room-object';
import * as RoomPosition from './position';

export const shape = bindName('RoomObject', {
	id: Id.format,
	pos: RoomPosition.format,
	effects: makeOptional(makeVector({
		effect: 'uint16',
		expireTime: 'uint32',
		level: 'uint16',
	})),
});

export const format = bindInterceptors(shape, { overlay: RoomObject });
