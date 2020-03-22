import * as RoomPosition from './position';
import type { Room } from './room';
import { Process, ProcessorSpecification } from '~/engine/processor/bind';
import { BufferObject } from '~/engine/schema/buffer-object';
import { checkCast, makeVector, withType, Format, Interceptor, Variant } from '~/engine/schema';
import * as Id from '~/engine/util/id';

export const format = withType<RoomObject>(checkCast<Format>()({
	id: Id.format,
	pos: RoomPosition.format,
	effects: makeVector({
		effect: 'uint16',
		expireTime: 'uint32',
		level: 'uint16',
	}),
}));

export abstract class RoomObject extends BufferObject {
	id!: string;
	pos!: any;
	effects!: any[];
	room!: Room;

	abstract get [Variant](): string;
	[Process]: ProcessorSpecification<this>['process'] | undefined;
}

export const interceptors = checkCast<Interceptor>()({
	members: { id: Id.interceptors },
	overlay: RoomObject,
});
