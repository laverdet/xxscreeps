import { BufferObject } from '~/engine/schema/buffer-object';
import { checkCast, makeVector, withType, Format, Interceptor } from '~/engine/schema';
import { variantFormat } from './room-object-variant';

import * as C from './constants';
import { RoomObject } from './room-object';

export const format = withType<Room>(checkCast<Format>()({
	name: 'string',
	objects: makeVector(variantFormat),
}));

export const Objects = Symbol('objects');

export class Room extends BufferObject {
	name!: string;
	[Objects]!: RoomObject[];
}

export const interceptors = checkCast<Interceptor>()({
	members: {
		objects: { symbol: Objects },
	},
	overlay: Room,
});
