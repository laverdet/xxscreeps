import type { BufferView } from 'xxscreeps/schema/buffer-view.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { array, compose, declare, withType } from 'xxscreeps/schema/index.js';

const hex8 = [ ...Fn.map(Fn.range(0x100), ii => ii.toString(16).padStart(2, '0')) ];
const hex32 = (value: number) =>
	hex8[value >>> 24]! + hex8[(value >>> 16) & 0xff]! + hex8[(value >>> 8) & 0xff]! + hex8[value & 0xff]!;

export const optionalFormat = declare('Id', compose(array(4, 'uint32'), {
	composeFromBuffer(view: BufferView, offset: number) {
		// First byte is length, remaining bytes are the hex string id. Fits up to 24 characters
		// into 4 bytes. This could be increased to 30 characters if needed by putting more in the
		// front.
		const offset32 = offset >>> 2;
		const length = view.int8[offset]!;
		if (length === 0) {
			return null;
		} else {
			return (
				hex32(view.uint32[offset32 + 1]!) +
				hex32(view.uint32[offset32 + 2]!) +
				hex32(view.uint32[offset32 + 3]!)
			).slice(24 - length);
		}
	},

	decomposeIntoBuffer(value: string | null, view: BufferView, offset: number) {
		// Write from the end of the string in chunks of 8
		let offset32 = (offset >>> 2) + 4;
		if (value === null) {
			view.uint32[offset32 - 1] =
				view.uint32[offset32 - 2] =
					view.uint32[offset32 - 3] =
						view.uint32[offset32 - 4] = 0;
			return;
		}
		const { length } = value;
		for (let ii = length; ii >= 8; ii -= 8) {
			view.uint32[--offset32] = parseInt(value.substr(ii - 8, 8), 16);
		}
		// Leaves the front of the string with length < 8 for this part
		view.uint32[--offset32] = parseInt(value.substr(0, length % 8), 16);
		// And write the length
		view.uint8[offset] = value.length;
	},

	kaitai: [ {
		id: 'id_len',
		type: 'u1',
	}, {
		size: 3,
	}, {
		id: 'id',
		type: 'u4',
		repeat: 'expr',
		'repeat-expr': 3,
	} ],
}));

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
