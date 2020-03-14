import { BufferObject } from '~/engine/schema/buffer-object';
import { makeArray, makeVector } from '~/engine/schema/format';

export const format = {
	id: makeArray(6, 'uint16' as const),
	pos: 'int32' as const,
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
}
