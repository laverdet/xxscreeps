import * as RoomPosition from '../position';
import type { Room } from '../room';
import { Process, ProcessorSpecification, Tick } from '~/engine/processor/bind';
import { BufferObject } from '~/lib/schema/buffer-object';
import { checkCast, makeOptional, makeVector, withType, Format, Interceptor, Variant } from '~/lib/schema';
import * as Id from '~/engine/util/id';

export const Owner: unique symbol = Symbol('owner');

export const format = withType<RoomObject>(checkCast<Format>()({
	id: Id.format,
	pos: withType<RoomPosition.RoomPosition>(RoomPosition.format),
	effects: makeOptional(makeVector({
		effect: 'uint16',
		expireTime: 'uint32',
		level: 'uint16',
	})),
}));

export abstract class RoomObject extends BufferObject {
	id!: string;
	pos!: RoomPosition.RoomPosition;
	effects!: any[];
	room!: Room;

	abstract get [Variant](): string;
	[Process]?: ProcessorSpecification<this>['process'];
	[Tick]?: ProcessorSpecification<this>['tick'];
}

export const interceptors = {
	RoomObject: checkCast<Interceptor>()({
		members: { id: Id.interceptors },
		overlay: RoomObject,
	}),
};

export const schemaFormat = { RoomObject: format };
