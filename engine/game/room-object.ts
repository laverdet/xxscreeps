import * as RoomPosition from './position';
import type { Room } from './room';
import { Process, ProcessorSpecification } from '~/engine/processor/bind';
import { BufferObject } from '~/engine/schema/buffer-object';
import { makeVector } from '~/engine/schema/format';
import type { Interceptors } from '~/engine/schema/interceptor';
import * as Id from '~/engine/util/id';

export const format = {
	id: Id.format,
	pos: RoomPosition.format,
	effects: makeVector({
		effect: 'uint16' as const,
		expireTime: 'uint32' as const,
		level: 'uint16' as const,
	}),
};

export class RoomObject extends BufferObject {
	id!: string;
	pos!: any;
	effects!: any[];
	room!: Room;
	[Process]: ProcessorSpecification<this>['process'] | undefined;
}

export const interceptors: Interceptors = {
	members: { id: Id.interceptors },
	overlay: RoomObject,
};
