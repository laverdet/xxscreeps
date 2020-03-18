import { BufferObject } from '~/engine/schema/buffer-object';
import { makeArray, makeVector } from '~/engine/schema/format';
import type { Interceptors } from '~/engine/schema/interceptor';

export const format = {
	id: makeArray(3, 'uint32' as const),
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

export const interceptors: Interceptors = {
	members: {
		id: {
			compose: (id: number[]) =>
				id[0].toString(16).padStart(8, '0') + id[1].toString(16).padStart(8, '0') +
				id[2].toString(16).padStart(8, '0'),
			decompose: (id: string) => id.match(/.{8}/g)!.map(str => parseInt(str, 16)),
		},
	},
};
