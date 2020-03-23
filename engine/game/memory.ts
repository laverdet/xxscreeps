declare const globalThis: any;
declare global {
	let Memory: any;
	let RawMemory: { get: typeof get; set: typeof set };
}

const kMemoryGrowthSize = 1024;
const kMemoryMaxLength = 2 * 1024 * 1024;

let memory: Uint16Array;
let string: string | undefined;
let json: any;
let lastJson: any;
let isBufferOutOfDate = false;

function get() {
	if (string === undefined) {
		string = String.fromCharCode(...memory);
	}
	return string;
}

function set(value: string) {
	string = value;
	isBufferOutOfDate = true;
}

export function flush() {
	lastJson = undefined;
	if (string !== undefined) {
		// Check for JSON-based `Memory` object
		if (json !== undefined) {
			set(JSON.stringify(json));
			lastJson = json;
			setMemoryHook();
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
				memory = new Uint16Array(new SharedArrayBuffer(size + 1 & ~1));
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
	globalThis.RawMemory = { get, set };
	setMemoryHook();
}

function setMemoryHook() {
	Object.defineProperty(globalThis, 'Memory', {
		configurable: true,
		get() {
			let value = lastJson;
			if (value === undefined) {
				try {
					value = JSON.parse(get());
				} catch (err) {
					value = {};
				}
			}
			Object.defineProperty(globalThis, 'Memory', {
				configurable: true,
				value,
			});
			json = value;
			return value;
		},
	});
}
