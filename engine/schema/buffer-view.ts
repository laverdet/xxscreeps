import assert from 'assert';

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

	constructor(buffer: ArrayBuffer | SharedArrayBuffer, offset = 0) {
		assert.equal(offset % 4, 0);
		let { byteLength } = buffer;
		byteLength -= offset;
		this.uint8 = new Uint8Array(buffer, offset, byteLength);
		this.uint16 = new Uint16Array(buffer, offset, byteLength >>> 1);
		this.uint32 = new Uint32Array(buffer, offset, byteLength >>> 2);
		this.int8 = new Int8Array(buffer, offset, byteLength);
		this.int16 = new Int16Array(buffer, offset, byteLength >>> 1);
		this.int32 = new Int32Array(buffer, offset, byteLength >>> 2);
	}
}
