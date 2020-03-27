import { checkCast, makeOptional, makeVector, withType, Format, Interceptor } from '~/lib/schema';
import * as Id from '~/engine/util/id';
import { RoomPosition } from '~/game/position';
import { RoomObject } from '~/game/objects/room-object';
import { format as roomPositionFormat } from './position';

export { RoomObject };

export const format = withType<RoomObject>(checkCast<Format>()({
	id: Id.format,
	pos: withType<RoomPosition>(roomPositionFormat),
	effects: makeOptional(makeVector({
		effect: 'uint16',
		expireTime: 'uint32',
		level: 'uint16',
	})),
}));

export const interceptors = {
	RoomObject: checkCast<Interceptor>()({
		members: { id: Id.interceptors },
		overlay: RoomObject,
	}),
};

export const schemaFormat = { RoomObject: format };
