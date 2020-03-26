declare const globalThis: any;

const kMemoryGrowthSize = 1024;
const kMemoryMaxLength = 2 * 1024 * 1024;

let memory: Uint16Array;
let string: string | undefined;
let json: object | undefined;
let isBufferOutOfDate = false;

const RawMemory = {
	get() {
		if (string === undefined) {
			string = String.fromCharCode(...memory);
		}
		return string;
	},

	set(value: string) {
		json = undefined;
		string = value;
		isBufferOutOfDate = true;
	},
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
	return json!;
}

export function flush() {
	if (string !== undefined) {
		// Check for JSON-based `Memory` object
		if (json) {
			const value = json;
			RawMemory.set(JSON.stringify(json));
			json = value;
		}

		// Update the uint16 buffer
		if (isBufferOutOfDate) {
			const { length } = string;
			if (length > memory.length) {
				// Need to increase size of current buffer
				if (length > kMemoryMaxLength) {
					throw new Error(`Reached maximum ${'`Memory`'} limit. Requested: ${length} out of ${kMemoryMaxLength}`);
				}
				// Leave a little wiggle room
				const size = Math.min(kMemoryMaxLength, string.length + kMemoryGrowthSize);
				memory = new Uint16Array(new ArrayBuffer(size + 1 & ~1));
			}
			// Copy string into buffer
			for (let ii = 0; ii < string.length; ++ii) {
				memory[ii] = string.charCodeAt(ii);
			}
		}
	}
	return memory;
}

export function initialize(value: Uint16Array) {
	memory = value;
	globalThis.RawMemory = RawMemory;
	Object.defineProperty(globalThis, 'Memory', {
		configurable: true,
		get,
		set: (value: any) => {
			if (typeof value === 'object') {
				json = value;
			}
		},
	});
}
