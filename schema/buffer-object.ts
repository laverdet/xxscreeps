import { exchange } from 'xxscreeps/util/utility';
import type { BufferView } from './buffer-view';

// Symbols used to keep these functions from littering Typescript types
const GetBufferSymbol: unique symbol = Symbol();
const GetOffsetSymbol: unique symbol = Symbol();

/**
 * Any object that is backed by a secret ArrayBuffer. All schema objects must inherit from this one.
 */
export class BufferObject {
	#buffer: BufferView;
	#offset: number;
	constructor(buffer: BufferView, offset = 0) {
		this.#buffer = buffer;
		this.#offset = offset;
	}

	static [GetBufferSymbol](that: BufferObject) {
		return that.#buffer;
	}

	static [GetOffsetSymbol](that: BufferObject) {
		return that.#offset;
	}
}

// Make accessors only available to internal code
export const getBuffer = exchange(BufferObject, GetBufferSymbol);
export const getOffset = exchange(BufferObject, GetOffsetSymbol);

// Closed for business
Object.freeze(BufferObject);
Object.freeze(BufferObject.prototype);
