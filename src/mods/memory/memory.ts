import { typedArrayToString } from 'xxscreeps/utility/string';

const kMemoryGrowthSize = 4096;
const kMemoryMaxLength = 2 * 1024 * 1024;

let memory: Uint16Array;
let memoryLength = 0;
let string: string | undefined;
let json: object | undefined;
let isBufferOutOfDate = false;

function align(address: number) {
	const alignMinusOne = kMemoryGrowthSize - 1;
	return ~alignMinusOne & (address + alignMinusOne);
}

export const RawMemory = {
	get() {
		if (string === undefined) {
			string = typedArrayToString(memory.subarray(0, memoryLength));
		}
		return string;
	},

	set(value: string) {
		if (typeof value !== 'string') {
			throw new TypeError('Memory value must be a string');
		}
		json = undefined;
		string = value;
		isBufferOutOfDate = true;
	},

	setActiveSegments() {},
	setActiveForeignSegment() {},
	setPublicSegments() {},
	segments: {},
};

export function get(): any {
	if (json) {
		return json;
	}
	try {
		json = JSON.parse(RawMemory.get());
	} catch (err) {
		json = {};
	}
	return json;
}

export function flush(): Readonly<Uint8Array> {
	if (string === undefined) {
		return new Uint8Array(0);
	}

	// Check for JSON-based `Memory` object
	if (json) {
		const value = json;
		try {
			RawMemory.set(JSON.stringify(json));
		} catch (err) {
			console.error(err);
		}
		json = value;
	}

	// Update the uint16 buffer
	if (isBufferOutOfDate) {
		const { length } = string;
		if (length > memory.length) {
			// Need to increase size of current buffer
			if (length > kMemoryMaxLength) {
				throw new Error(`Reached maximum \`Memory\` limit. Requested: ${length} out of ${kMemoryMaxLength}`);
			}
			// Leave a little wiggle room
			memory = new Uint16Array(new SharedArrayBuffer(align(length) << 1));
		}
		// Copy string into buffer
		for (let ii = 0; ii < length; ++ii) {
			memory[ii] = string.charCodeAt(ii);
		}
		memoryLength = length;
	}
	return new Uint8Array(memory.buffer, 0, memoryLength << 1);
}

export function initialize(value: Readonly<Uint8Array> | null) {
	json = undefined;
	if (value) {
		memoryLength = value.length >>> 1;
		memory = new Uint16Array(new SharedArrayBuffer(align(value.length)));
		memory.set(new Uint16Array(value.buffer, value.byteOffset, memoryLength));
	} else {
		memoryLength = 0;
		memory = new Uint16Array(new SharedArrayBuffer(kMemoryGrowthSize));
	}
}