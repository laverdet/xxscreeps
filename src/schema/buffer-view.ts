const typedArrays = [ 'uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32', 'double' ] as const;
const zeroProxy = new Proxy(new Uint8Array([ 0 ]), { get: () => 0 });

/**
 * TypeArray holder for a chunk of serialized game state. Probably holds a room at time.
 */
export class BufferView {
	readonly uint8: Uint8Array;
	readonly uint16: Uint16Array;
	readonly uint32: Uint32Array;
	readonly int8: Int8Array;
	readonly int16: Int16Array;
	readonly int32: Int32Array;
	readonly double: Float64Array;

	constructor(buffer: ArrayBuffer | SharedArrayBuffer, offset = 0) {
		let { byteLength } = buffer;
		byteLength -= offset;
		this.uint8 = new Uint8Array(buffer, offset, byteLength);
		this.uint16 = new Uint16Array(buffer, offset, byteLength >>> 1);
		this.uint32 = new Uint32Array(buffer, offset, byteLength >>> 2);
		this.int8 = new Int8Array(buffer, offset, byteLength);
		this.int16 = new Int16Array(buffer, offset, byteLength >>> 1);
		this.int32 = new Int32Array(buffer, offset, byteLength >>> 2);
		this.double = new Float64Array(buffer, offset, byteLength >>> 3);
	}

	static fromTypedArray(buffer: Uint8Array): BufferView;
	static fromTypedArray(buffer: Readonly<Uint8Array>): Readonly<BufferView>
	static fromTypedArray(buffer: Uint8Array) {
		return new BufferView(buffer.buffer, buffer.byteOffset);
	}

	/**
	 * Forcefully detach the underlying memory from this view, invalidating all objects referring to
	 * it, and freeing the retained memory
	 */
	detach(error: () => Error) {
		for (const key of typedArrays) {
			delete this[key];
		}
		Object.defineProperties(this, Object.fromEntries(typedArrays.map(key => [
			key, {
				get: () => { throw error() },
			},
		])));
	}

	/**
	 * Detach the buffer and force all entries to be 0
	 */
	nullify() {
		for (const key of typedArrays) {
			(this as any)[key] = zeroProxy;
		}
	}
}
