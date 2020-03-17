import { makeArray } from '~/engine/schema/format';
import type { ReadInterceptors, WriteInterceptors } from '~/engine/schema';
import type { BufferView } from '~/engine/schema/buffer-view';
const { apply } = Reflect;
const { Uint8Array } = global;
const { set } = Uint8Array.prototype;

export const format = {
	roomName: 'string' as const,
	terrain: makeArray(625, 'uint8'),
};

export const readInterceptors: ReadInterceptors = {
	terrain: {
		composeFromBuffer: (view: BufferView, offset: number) => new Terrain(view.uint8.subarray(offset)),
	},
};

export const writeInterceptors: WriteInterceptors = {
	terrain: {
		decomposeIntoBuffer: (value: Terrain, view: BufferView, offset: number) => {
			value.getRawBuffer(view.uint8.subarray(offset));
			return 625;
		},
	},
};

const GetBufferSymbol = Symbol();

export class Terrain {
	#buffer: Uint8Array;

	constructor(buffer: Uint8Array) {
		this.#buffer = buffer;
	}

	static [GetBufferSymbol](that: Terrain) {
		return that.#buffer;
	}

	get(xx: number, yy: number) {
		const index = xx * 50 + yy;
		if (index >= 0 && index < 2500) {
			return this.#buffer[index >>> 2] >>> ((index & 0x03) << 1) & 0x03;
		}
	}

	getRawBuffer(destinationArray?: Uint8Array): Uint8Array {
		if (destinationArray === undefined) {
			return this.getRawBuffer(new Uint8Array(625));
		} else {
			return apply(set, destinationArray, [ getBuffer(this) ]);
		}
	}
}

export const getBuffer = Terrain[GetBufferSymbol];
delete Terrain[GetBufferSymbol];

export class TerrainWriter extends Terrain {
	constructor(buffer = new Uint8Array(625)) {
		super(buffer);
	}

	set(xx: number, yy: number, value: number) {
		const buffer = getBuffer(this);
		const index = xx * 50 + yy;
		if (index >= 0 && index < 2500) {
			const byte = index >>> 2;
			const shift = (index & 0x03) << 1;
			buffer[byte] = buffer[byte] & ~(0x03 << shift) | (value & 0x03) << shift;
		}
	}
}
