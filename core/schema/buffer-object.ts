import { exchange } from 'xxscreeps/utility/utility';
import { BufferView } from './buffer-view';
import { XSymbol } from './symbol';

// Symbols used to keep these functions from littering Typescript types
const GetBuffer = XSymbol('getBuffer');
const GetOffset = XSymbol('getOffset');

// Used on newly-constructed to provide defaults on uninitialized fields
const zeroBuffer = new BufferView(new ArrayBuffer(1024));

/**
 * Any object that is backed by a secret ArrayBuffer. All schema objects must inherit from this one.
 */
export class BufferObject {
	#buffer: BufferView;
	#offset: number;

	constructor(buffer = zeroBuffer, offset = 0) {
		this.#buffer = buffer;
		this.#offset = offset;
	}

	static [GetBuffer](that: BufferObject) {
		return that.#buffer;
	}

	static [GetOffset](that: BufferObject) {
		return that.#offset;
	}
}

export const getBuffer = exchange(BufferObject, GetBuffer, (): never => { throw new Error });
export const getOffset = exchange(BufferObject, GetOffset, (): never => { throw new Error });
