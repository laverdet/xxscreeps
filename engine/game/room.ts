import { BufferObject } from '~/engine/schema/buffer-object';
import { makeVariant, makeVector } from '~/engine/schema/format';
import type { Interceptors } from '~/engine/schema/interceptor';

import { RoomObject } from '~/engine/game/room-object';
import * as Creep from '~/engine/game/creep';
import * as Source from '~/engine/game/source';

export const format = {
	name: 'string' as const,
	objects: makeVector(makeVariant(
		Creep.format,
		Source.format,
	)),
};

export const objects = Symbol('objects');
type RoomObjectMap = Map<string, RoomObject>;

export class Room extends BufferObject {
	name!: string;
	[objects]!: RoomObjectMap;
}

export const interceptors: Interceptors = {
	members: {
		objects: {
			compose(objects: RoomObject[]) {
				const map: RoomObjectMap = new Map;
				for (const object of objects) {
					map.set(object.id, object);
				}
				return map;
			},
			decompose: (map: RoomObjectMap) => map.values(),
			symbol: objects,
		},
	},
};
