import { BufferView } from './buffer-view.js';

// Used on newly-constructed to provide defaults on uninitialized fields
const zeroBuffer = new BufferView(new ArrayBuffer(0));
zeroBuffer.nullify();

/**
 * Any object that is backed by a secret ArrayBuffer. All schema objects must inherit from this one.
 */
export class BufferObject {
	readonly #buffer: BufferView;
	readonly #offset: number;

	constructor(buffer = zeroBuffer, offset = 0) {
		this.#buffer = buffer;
		this.#offset = offset;
	}

	static check(this: void, that: BufferObject) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			that.#buffer.int32;
			return true;
		} catch {
			return false;
		}
	}

	static detach(this: void, that: BufferObject, error: () => Error) {
		that.#buffer.detach(error);
	}

	static getBuffer(this: void, that: BufferObject) {
		return that.#buffer;
	}

	static getOffset(this: void, that: BufferObject) {
		return that.#offset;
	}
}

export const { check, detach, getBuffer, getOffset } = BufferObject;

BufferObject.check =
	BufferObject.detach =
		BufferObject.getBuffer =
			BufferObject.getOffset = (): never => { throw new Error(); };
