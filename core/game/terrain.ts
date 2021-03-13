import { array, compose, declare, struct, BufferView } from 'xxscreeps/schema';
import { exchange, uncurryThis } from 'xxscreeps/utility/utility';
export { TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP } from './constants';

const set = uncurryThis(Uint8Array.prototype.set);
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
		const index = yy * 50 + xx;
		if (index >= 0 && index < 2500) {
			return this.#buffer[index >>> 2] >>> ((index & 0x03) << 1) & 0x03;
		}
		return NaN;
	}

	getRawBuffer(destinationArray?: Uint8Array): Uint8Array {
		if (destinationArray === undefined) {
			return this.getRawBuffer(new Uint8Array(625));
		} else {
			set(destinationArray, getBuffer(this));
			return destinationArray;
		}
	}
}

export const getBuffer = exchange(Terrain, GetBufferSymbol, (): never => { throw new Error });

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

export const format = declare('Terrain', struct({
	name: 'string',
	terrain: compose(array(625, 'uint8'), {
		composeFromBuffer: (view: BufferView, offset: number) => new Terrain(view.uint8.subarray(offset)),
		decomposeIntoBuffer(value: Terrain, view: BufferView, offset: number) {
			value.getRawBuffer(view.uint8.subarray(offset));
			return 625;
		},
	}),
}));
