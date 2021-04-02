import { exchange } from 'xxscreeps/utility/utility';
import { BufferView } from './buffer-view';
import { XSymbol } from './symbol';

// Symbols used to keep these functions from littering Typescript types
const Check = XSymbol('check');
const Detach = XSymbol('detach');
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

	static [Check](that: BufferObject) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			that.#buffer.int32;
			return true;
		} catch (err) {
			return false;
		}
	}

	static [Detach](that: BufferObject, error: () => Error) {
		that.#buffer.detach(error);
	}

	static [GetBuffer](that: BufferObject) {
		return that.#buffer;
	}

	static [GetOffset](that: BufferObject) {
		return that.#offset;
	}
}

export const check = exchange(BufferObject, Check, (): never => { throw new Error });
export const detach = exchange(BufferObject, Detach, (): never => { throw new Error });
export const getBuffer = exchange(BufferObject, GetBuffer, (): never => { throw new Error });
export const getOffset = exchange(BufferObject, GetOffset, (): never => { throw new Error });
