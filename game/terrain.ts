import { checkCast, makeArray, withType, BufferView, Format, Interceptor } from '~/lib/schema';
import { exchange } from '~/lib/utility';

const { apply } = Reflect;
const { Uint8Array } = globalThis;
const { set } = Uint8Array.prototype;

export const kTerrainWall = 1;
export const kTerrainSwamp = 2;

export const format = checkCast<Format>()({
	name: 'string',
	terrain: withType<Terrain>(makeArray(625, 'uint8')),
});

const GetBufferSymbol: unique symbol = Symbol();

export class Terrain {
	#buffer: Uint8Array;

	constructor(buffer: Uint8Array) {
		this.#buffer = buffer;
	}

	static [GetBufferSymbol](that: Terrain) {
		return that.#buffer;
	}

	get(xx: number, yy: number) {
		const index = yy * 50 + xx;
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

export const getBuffer = exchange(Terrain, GetBufferSymbol);

export class TerrainWriter extends Terrain {
	constructor(buffer = new Uint8Array(625)) {
		super(buffer);
	}

	set(xx: number, yy: number, value: number) {
		const buffer = getBuffer(this);
		const index = yy * 50 + xx;
		if (index >= 0 && index < 2500) {
			const byte = index >>> 2;
			const shift = (index & 0x03) << 1;
			buffer[byte] = buffer[byte] & ~(0x03 << shift) | (value & 0x03) << shift;
		}
	}
}

export function isBorder(xx: number, yy: number) {
	return xx === 0 || xx === 49 || yy === 0 || yy === 49;
}

export function isNearBorder(xx: number, yy: number) {
	return (xx + 2) % 50 < 4 || (yy + 2) % 50 < 4;
}

export const interceptors = checkCast<Interceptor>()({
	members: {
		terrain: {
			composeFromBuffer: (view: BufferView, offset: number) => new Terrain(view.uint8.subarray(offset)),
			decomposeIntoBuffer(value: Terrain, view: BufferView, offset: number) {
				value.getRawBuffer(view.uint8.subarray(offset));
				return 625;
			},
		},
	},
});
