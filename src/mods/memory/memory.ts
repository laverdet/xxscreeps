import * as Fn from 'xxscreeps/utility/functional';
import { typedArrayToString, utf16ToBuffer } from 'xxscreeps/utility/string';

const kMemoryGrowthSize = 4096;
export const kMaxMemoryLength = 2 * 1024 * 1024;
export const kMaxActiveSegments = 10;
export const kMaxMemorySegmentId = 100;
export const kMaxMemorySegmentLength = 100 * 1024;

let activeSegments = new Map<number, string>();
let didUpdateSegments = false;
let requestedForeignSegment: null | {
	id: number | undefined;
	username: string;
};
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
	/**
	 * An object with asynchronous memory segments available on this tick. Each object key is the
	 * segment ID with data in string values. Use `setActiveSegments` to fetch segments on the next
	 * tick. Segments data is saved automatically in the end of the tick. The maximum size per segment
	 * is 100 KB.
	 */
	segments: {} as Record<string, string>,

	/**
	 * Get a raw string representation of the `Memory` object.
	 */
	get() {
		if (string === undefined) {
			string = typedArrayToString(memory.subarray(0, memoryLength));
		}
		return string;
	},

	/**
	 * Set new `Memory` value.
	 * @param value New memory value as a string.
	 */
	set(value: string) {
		if (typeof value !== 'string') {
			throw new TypeError('Memory value must be a string');
		}
		json = undefined;
		string = value;
		isBufferOutOfDate = true;
	},

	/**
	 * Request memory segments using the list of their IDs. Memory segments will become available on
	 * the next tick in segments object.
	 * @param ids An array of segment IDs. Each ID should be a number from 0 to 99. Maximum 10
	 * segments can be active at the same time. Subsequent calls of setActiveSegments override
	 * previous ones.
	 */
	setActiveSegments(ids: number[]) {
		if (!Array.isArray(ids) || !ids.every(isValidSegmentId)) {
			throw new TypeError('Invalid segment request');
		}
		if (ids.length > kMaxActiveSegments) {
			throw new Error(`Only ${kMaxActiveSegments} memory segments can be active at the same time`);
		}
		if (ids.length !== activeSegments.size || !ids.every(id => activeSegments.has(id))) {
			didUpdateSegments = true;
			activeSegments = new Map(Fn.map(ids, id => [ id, activeSegments.get(id) ?? '' ]));
		}
	},

	/**
	 * Request a memory segment of another user. The segment should be marked by its owner as public
	 * using `setPublicSegments`. The segment data will become available on the next tick in
	 * `foreignSegment` object. You can only have access to one foreign segment at the same time.
	 * @param username The name of another user. Pass `null` to clear the foreign segment.
	 * @param id The ID of the requested segment from 0 to 99. If undefined, the user's default public
	 * segment is requested as set by setDefaultPublicSegment.
	 */
	setActiveForeignSegment(username: string, id?: number) {
		requestedForeignSegment = { id, username };
	},

	/**
	 * Set the specified segment as your default public segment. It will be returned if no `id`
	 * parameter is passed to `setActiveForeignSegment` by another user.
	 * @param id The ID of the memory segment from 0 to 99. Pass `null` to remove your default public
	 * segment.
	 */
	setDefaultPublicSegment(_id: number) { console.error('TODO: setDefaultPublicSegment') },

	/**
	 * Set specified segments as public. Other users will be able to request access to them using `setActiveForeignSegment`.
	 * @param ids An array of segment IDs. Each ID should be a number from 0 to 99. Subsequent calls
	 * of `setPublicSegments` override previous ones.
	 */
	setPublicSegments(_ids: number[]) { /*console.error('TODO: setPublicSegments')*/ },
};

/**
 * `Game.memory` getter
 */
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

/**
 * Flush non-segment `RawMemory` payload back to driver as `Uint8Array`
 */
export function flush(): Uint8Array {
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
			if (length > kMaxMemoryLength) {
				throw new Error(`Reached maximum \`Memory\` limit. Requested: ${length} out of ${kMaxMemoryLength}`);
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

/**
 * Initialize non-segment `RawMemory` payload. This only needs to be invoked once on runtime
 * creation.
 */
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

export type SegmentPayload = {
	id: number;
	payload: Readonly<Uint8Array> | null;
};

export function isValidSegmentId(id: number) {
	return Number.isInteger(id) && id >= 0 && id < kMaxMemorySegmentId;
}

/**
 * If `activeSegments` was updated then return the newly-requested segment ids
 */
export function flushActiveSegments() {
	if (didUpdateSegments) {
		didUpdateSegments = false;
		return [ ...activeSegments.keys() ];
	} else {
		return null;
	}
}

/**
 * Returns the request from `RawMemory.setActiveForeignSegment`
 */
export function flushForeignSegment() {
	const tmp = requestedForeignSegment;
	requestedForeignSegment = null;
	return tmp;
}

/**
 * Flush updated `RawMemory` segments
 */
export function flushSegments() {
	const entries = Object.entries(RawMemory.segments);
	if (entries.length === 0) {
		return null;
	} else if (entries.length > kMaxActiveSegments) {
		console.error(`Cannot save more than ${kMaxActiveSegments} memory segments on the same tick`);
		return null;
	}
	return [ ...Fn.filter(Fn.map(entries, ([ id, string ]): SegmentPayload | undefined => {
		if (typeof string !== 'string') {
			console.error(`Memory segment #${id} is not a string`);
		} else if (string.length > kMaxMemorySegmentLength) {
			console.error(`Memory segment #${id} has exceeded limit of ${kMaxMemorySegmentLength}`);
		} else {
			const prev = activeSegments.get(+id);
			if (prev !== string) {
				if (prev !== undefined) {
					activeSegments.set(+id, string);
				}
				return {
					id: Number(id),
					payload: utf16ToBuffer(string),
				};
			}
		}
	})) ];
}

/**
 * Set up `RawMemory.segments` every tick
 */
export function loadSegments(segments?: SegmentPayload[]) {
	// Keep segment strings from previous tick, and simultaneously throw away stale strings
	RawMemory.segments = Fn.fromEntries(activeSegments);
	// Update with new segment payloads
	if (segments) {
		for (const segment of segments) {
			const { payload } = segment;
			const value = function() {
				if (payload === null) {
					return '';
				} else {
					const uint16 = new Uint16Array(payload.buffer, payload.byteOffset, payload.length >>> 1);
					return typedArrayToString(uint16);
				}
			}();
			RawMemory.segments[segment.id] = value;
			if (activeSegments.has(segment.id)) {
				activeSegments.set(segment.id, value);
			}
		}
	}
}
