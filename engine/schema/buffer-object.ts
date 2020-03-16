import type { BufferView } from './buffer-view';

// Symbols used to keep these functions from littering Typescript types
const GetBufferSymbol = Symbol();
const GetOffsetSymbol = Symbol();

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
export const getBuffer = BufferObject[GetBufferSymbol];
delete BufferObject[GetBufferSymbol];
export const getOffset = BufferObject[GetOffsetSymbol];
delete BufferObject[GetOffsetSymbol];

// Closed for business
Object.freeze(BufferObject);
Object.freeze(BufferObject.prototype);
