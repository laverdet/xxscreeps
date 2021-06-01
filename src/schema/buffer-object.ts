import { exchange } from 'xxscreeps/utility/utility';
import { BufferView } from './buffer-view';

// Used on newly-constructed to provide defaults on uninitialized fields
const zeroBuffer = new BufferView(new ArrayBuffer(0));
zeroBuffer.nullify();

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

	static check(that: BufferObject) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			that.#buffer.int32;
			return true;
		} catch (err) {
			return false;
		}
	}

	static detach(that: BufferObject, error: () => Error) {
		that.#buffer.detach(error);
	}

	static getBuffer(that: BufferObject) {
		return that.#buffer;
	}

	static getOffset(that: BufferObject) {
		return that.#offset;
	}
}

export const check = exchange(BufferObject, 'check', (): never => { throw new Error });
export const detach = exchange(BufferObject, 'detach', (): never => { throw new Error });
export const getBuffer = exchange(BufferObject, 'getBuffer', (): never => { throw new Error });
export const getOffset = exchange(BufferObject, 'getOffset', (): never => { throw new Error });
