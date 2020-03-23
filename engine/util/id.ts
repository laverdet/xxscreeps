import type { BufferView } from '~/engine/schema/buffer-view';
import { checkCast, makeArray, withType } from '~/engine/schema';
import type { MemberInterceptor } from '~/engine/schema/interceptor';

export const format = withType<string>(makeArray(4, 'uint32'));

export const interceptors = checkCast<MemberInterceptor>()({
	composeFromBuffer(view: BufferView, offset: number) {
		// First byte is length, remaining bytes are the hex string id. Fits up to 24 characters
		// into 4 bytes. This could be increased to 30 characters if needed by putting more in the
		// front.
		const offset32 = offset >>> 2;
		const length = view.int8[offset];
		return length === 0 ? undefined : (
			view.uint32[offset32 + 1].toString(16).padStart(8, '0') +
			view.uint32[offset32 + 2].toString(16).padStart(8, '0') +
			view.uint32[offset32 + 3].toString(16).padStart(8, '0')
		).substr(24 - view.int8[offset]);
	},

	decomposeIntoBuffer(value: string, view: BufferView, offset: number) {
		// Write from the end of the string in chunks of 8
		let offset32 = (offset >>> 2) + 4;
		if (value === undefined) {
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

export function generateId() {
	let id = '';
	for (let ii = 0; ii < 3; ++ii) {
		id += Math.floor(Math.random() * 2 ** 32).toString(16).padStart(8, '0');
	}
	return id;
}
