import type { BufferView } from 'xxscreeps/schema/buffer-view';
import { array, declare, withType } from 'xxscreeps/schema';

export const optionalFormat = declare('Id', array(4, 'uint32'), {
	composeFromBuffer(view: BufferView, offset: number) {
		// First byte is length, remaining bytes are the hex string id. Fits up to 24 characters
		// into 4 bytes. This could be increased to 30 characters if needed by putting more in the
		// front.
		const offset32 = offset >>> 2;
		const length = view.int8[offset];
		return length === 0 ? null : (
			view.uint32[offset32 + 1].toString(16).padStart(8, '0') +
			view.uint32[offset32 + 2].toString(16).padStart(8, '0') +
			view.uint32[offset32 + 3].toString(16).padStart(8, '0')
		).substr(24 - view.int8[offset]);
	},

	decomposeIntoBuffer(value: string | null, view: BufferView, offset: number) {
		// Write from the end of the string in chunks of 8
		let offset32 = (offset >>> 2) + 4;
		if (value === null) {
			view.uint32[offset32 - 1] =
			view.uint32[offset32 - 2] =
			view.uint32[offset32 - 3] =
			view.uint32[offset32 - 4] = 0;
			return 16;
		}
		const { length } = value;
		for (let ii = length; ii >= 8; ii -= 8) {
			view.uint32[--offset32] = parseInt(value.substr(ii - 8, 8), 16);
		}
		// Leaves the front of the string with length < 8 for this part
		view.uint32[--offset32] = parseInt(value.substr(0, length % 8), 16);
		// Fill remaining memory with 0's
		for (let ii = (length - 1) >>> 3; ii < 2; ++ii) {
			view.uint32[--offset32] = 0;
		}
		// And write the length
		view.uint8[offset] = value.length;
		return 16;
	},
});

// Most of the time id strings are required so this type is just more convenient
export const format = withType<string>(optionalFormat);

function randomChunk8() {
	return Math.floor(Math.random() * 2 ** 32).toString(16).padStart(8, '0');
}

export function generateId(length = 24) {
	let id = length % 8 === 0 ? '' : randomChunk8().substr(0, length % 8);
	for (let ii = length >> 3; ii > 0; --ii) {
		id += randomChunk8();
	}
	return id;
}
