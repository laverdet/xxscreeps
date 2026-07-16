import { Fn } from 'xxscreeps/functional/fn.js';
import { typedArrayToString, utf16IntoBuffer, utf16ToBuffer } from 'xxscreeps/utility/string.js';

const { defineProperty } = Object;
const kMemoryGrowthSize = 4096;
export const kMaxMemoryLength = 2 * 1024 * 1024;
export const kMaxActiveSegments = 10;
export const kMaxMemorySegmentId = 100;
export const kMaxMemorySegmentLength = 100 * 1024;

interface MemoryRecord {
	[key: string]: unknown;
	creeps?: Record<string, Record<string, unknown>>;
	flags?: Record<string, Record<string, unknown>>;
	rooms?: Record<string, Record<string, unknown>>;
	spawns?: Record<string, Record<string, unknown>>;
}

let activeSegments = new Map<number, string>();
let didUpdateSegments = false;
// `undefined` = no call this tick, `null` = explicit clear, object = new request. Matches the
// tri-state convention on the driver payload.
let requestedForeignSegment: { id: number | undefined; username: string } | null | undefined;
let requestedDefaultPublicSegment: number | null | undefined;
let requestedPublicSegments: number[] | undefined;
let memory: Uint16Array;
let memoryLength = 0;
let string: string | undefined;
let json: MemoryRecord | undefined;
let previousJson: MemoryRecord | undefined;
let isBufferOutOfDate = false;

function align(address: number) {
	const alignMinusOne = kMemoryGrowthSize - 1;
	return ~alignMinusOne & (address + alignMinusOne);
}

/**
 * Vanilla Screeps runs a flagrantly wasteful `JSON.parse` each tick on the player's memory. Besides
 * wasting CPU this also has the effect of turning `undefined` into `null`, removing `undefined`
 * object fields, and of course copying the entire object. This function aims to simulate some of
 * those effects without the cost of deserializing the whole memory payload.
*/
function crunch(payload: unknown) {
	if (typeof payload === 'object') {
		if (Array.isArray(payload)) {
			for (const [ key, value ] of payload.entries()) {
				if (value === undefined) {
					payload[key] = null;
				} else {
					crunch(value);
				}
			}
		} else if (payload !== null) {
			for (const [ key, value ] of Object.entries(payload)) {
				if (value === undefined) {
					// @ts-expect-error
					delete payload[key];
				} else {
					crunch(value);
				}
			}
		}
	}
}

/**
 * `RawMemory` object allows to implement your own memory stringifier instead of built-in serializer
 * based on `JSON.stringify`. It also allows to request up to 10 MB of additional memory using
 * asynchronous memory segments feature. You can also access memory segments of other players using
 * methods below.
 * @public
 * @see https://docs.screeps.com/api/#RawMemory
 */
export const RawMemory = {
	/** @deprecated */
	_parsed: undefined as unknown,

	/**
	 * An object with asynchronous memory segments available on this tick. Each object key is the
	 * segment ID with data in string values. Use
	 * [`setActiveSegments`](https://docs.screeps.com/api/#RawMemory.setActiveSegments) to fetch
	 * segments on the next tick. Segments data is saved automatically in the end of the tick. The
	 * maximum size per segment is 100 KB.
	 * @public
	 * @see https://docs.screeps.com/api/#RawMemory.segments
	 */
	segments: {} as Record<string, string>,

	/**
	 * An object with a memory segment of another player available on this tick. Use
	 * [`setActiveForeignSegment`](https://docs.screeps.com/api/#RawMemory.setActiveForeignSegment) to
	 * fetch segments on the next tick. The object follows {@link ForeignSegment}.
	 * @public
	 * @see https://docs.screeps.com/api/#RawMemory.foreignSegment
	 */
	foreignSegment: undefined as ForeignSegment | undefined,

	/**
	 * Get a raw string representation of the `Memory` object.
	 * @returns Returns a string value.
	 * @public
	 * @see https://docs.screeps.com/api/#RawMemory.get
	 */
	get() {
		return string ??= typedArrayToString(memory.subarray(0, memoryLength));
	},

	/**
	 * Set new `Memory` value.
	 * @param value New memory value as a string.
	 * @public
	 * @see https://docs.screeps.com/api/#RawMemory.set
	 */
	set(value: string) {
		// `RawMemory._parsed` is reset, `value` becomes next canonical string.
		// https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/runtime/runtime.js#L108-L121
		if (typeof value !== 'string') {
			throw new TypeError('Memory value must be a string');
		} else if (value.length > kMaxMemoryLength) {
			throw new Error('Raw memory length exceeded 2 MB limit');
		}
		previousJson = RawMemory._parsed = undefined;
		string = value;
		isBufferOutOfDate = true;
	},

	/**
	 * Request memory segments using the list of their IDs. Memory segments will become available on
	 * the next tick in [`segments`](https://docs.screeps.com/api/#RawMemory.segments) object.
	 * @param ids An array of segment IDs. Each ID should be a number from 0 to 99. Maximum 10
	 * segments can be active at the same time. Subsequent calls of `setActiveSegments` override
	 * previous ones.
	 * @public
	 * @see https://docs.screeps.com/api/#RawMemory.setActiveSegments
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
	 * using [`setPublicSegments`](https://docs.screeps.com/api/#RawMemory.setPublicSegments). The
	 * segment data will become available on the next tick in
	 * [`foreignSegment`](https://docs.screeps.com/api/#RawMemory.foreignSegment) object. You can only
	 * have access to one foreign segment at the same time.
	 * @param username The name of another user. Pass `null` to clear the foreign segment.
	 * @param id The ID of the requested segment from 0 to 99. If undefined, the user's default public
	 * segment is requested as set by
	 * [`setDefaultPublicSegment`](https://docs.screeps.com/api/#RawMemory.setDefaultPublicSegment).
	 * @public
	 * @see https://docs.screeps.com/api/#RawMemory.setActiveForeignSegment
	 */
	setActiveForeignSegment(username: string | null, id?: number) {
		if (username === null) {
			requestedForeignSegment = null;
			return;
		}
		if (id !== undefined && !isValidSegmentId(id)) {
			throw new Error(`"${id}" is not a valid segment ID`);
		}
		requestedForeignSegment = { id, username };
	},

	/**
	 * Set the specified segment as your default public segment. It will be returned if no `id`
	 * parameter is passed to
	 * [`setActiveForeignSegment`](https://docs.screeps.com/api/#RawMemory.setActiveForeignSegment) by
	 * another user.
	 * @param id The ID of the memory segment from 0 to 99. Pass `null` to remove your default public
	 * segment.
	 * @public
	 * @see https://docs.screeps.com/api/#RawMemory.setDefaultPublicSegment
	 */
	setDefaultPublicSegment(id: number | null) {
		if (id !== null && !isValidSegmentId(id)) {
			throw new Error(`"${id}" is not a valid segment ID`);
		}
		requestedDefaultPublicSegment = id;
	},

	/**
	 * Set specified segments as public. Other users will be able to request access to them using
	 * [`setActiveForeignSegment`](https://docs.screeps.com/api/#RawMemory.setActiveForeignSegment).
	 * @param ids An array of segment IDs. Each ID should be a number from 0 to 99. Subsequent calls
	 * of `setPublicSegments` override previous ones.
	 * @public
	 * @see https://docs.screeps.com/api/#RawMemory.setPublicSegments
	 */
	setPublicSegments(ids: number[]) {
		if (!Array.isArray(ids)) {
			throw new TypeError(`"${ids}" is not an array`);
		}
		for (const id of ids) {
			if (!isValidSegmentId(id)) {
				throw new Error(`"${id}" is not a valid segment ID`);
			}
		}
		requestedPublicSegments = [ ...ids ];
	},
};

/**
 * `Memory` getter.
 */
export let get = getIsDefault;

// Default value of `get Memory`
function getIsDefault(): MemoryRecord {
	if (json) {
		return json;
	} else if (previousJson) {
		return json = RawMemory._parsed = previousJson;
	}

	// https://github.com/screeps/engine/blob/1b9b1541923f061311474a2f1bac0fea37911f70/src/game/game.js#L479-L500
	try {
		const memory = RawMemory.get();
		return json = RawMemory._parsed = memory === '' ? {} : JSON.parse(memory) as MemoryRecord;
	} catch {
		// @ts-expect-error
		return json = RawMemory._parsed = null as MemoryRecord;
	}
}

// `Object.defineProperty` hook sets `get` to this function on `Memory` tampering.
function getIsClobbered(): MemoryRecord {
	// @ts-expect-error
	return globalThis.Memory as MemoryRecord;
}

/**
 * Flush non-segment `RawMemory` payload back to driver as `Uint8Array`
 */
export function flush() {
	get = getIsDefault;
	// Screeps checks two memory locations to flush back to the database, basically:
	// `(RawMemory._parsed && JSON.stringify(RawMemory._parsed)) || data.userMemory`
	// https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/runtime/runtime.js#L246-L248
	// https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/runtime/runtime.js#L276

	// The user has no direct control over `data.userMemory`, but it can be reset with
	// `RawMemory.set`. It is set to the database contents at the start of the tick.

	// The user has direct access to `RawMemory._parsed`, and at the beginning of
	// each tick it is reset to `undefined`.

	// Reset for next tick
	const { _parsed } = RawMemory;
	RawMemory._parsed = json = undefined;

	// Memory has not been used (at all, during this whole reset)
	if (string === undefined && _parsed === undefined) {
		return { size: memoryLength };
	}

	// Handle spooky Memory behaviors
	if (_parsed) {
		// Typical case: user accessed `Memory`, so we simulate vanilla reconstruction and save the
		// string.
		crunch(previousJson = _parsed as MemoryRecord);
		try {
			string = JSON.stringify(previousJson);
			isBufferOutOfDate = true;
		} catch (err) {
			console.error(err);
			return { size: memoryLength };
		}
	} else if (!isBufferOutOfDate || string === undefined) {
		// This is either the Memhack case, or the user simply didn't look at `Memory` at all this tick.
		// In either case there is no more work to do.
		// "Memhack" - https://wiki.screepspl.us/index.php/MemHack
		return { size: memoryLength };
	}

	// Update the uint16 buffer
	const { length } = string;
	if (length > memory.length) {
		// Need to increase size of current buffer
		if (length > kMaxMemoryLength) {
			throw new Error(`Reached maximum \`Memory\` limit. Requested: ${length} out of ${kMaxMemoryLength}`);
		}
		// Leave a little wiggle room
		memory = new Uint16Array(new SharedArrayBuffer(Math.min(kMaxMemoryLength, align(length)) << 1));
	}

	// Copy string into buffer & flush to driver
	utf16IntoBuffer(string, memory);
	memoryLength = length;
	return {
		payload: new Uint8Array(memory.buffer, 0, memoryLength << 1),
		size: memoryLength,
	};
}

/**
 * Initialize non-segment `RawMemory` payload. This only needs to be invoked once on runtime
 * creation.
 */
export function initialize(value: Readonly<Uint8Array> | null) {
	json = undefined;
	previousJson = undefined;
	string = undefined;
	if (value) {
		memoryLength = value.length >>> 1;
		memory = new Uint16Array(new SharedArrayBuffer(align(value.length)));
		memory.set(new Uint16Array(value.buffer, value.byteOffset, memoryLength));
	} else {
		memoryLength = 0;
		memory = new Uint16Array(new SharedArrayBuffer(kMemoryGrowthSize));
	}
	// Yes, I know about `Object.defineProperties` and `Reflect.defineProperty`. The intent is to
	// handle Memhack correctly, which would always take this path.
	Object.defineProperty = (target, key, descriptor) => {
		if (target === globalThis && key === 'Memory') {
			get = getIsClobbered;
		}
		return defineProperty(target, key, descriptor);
	};
}

export type SegmentPayload = {
	id: number;
	payload: Readonly<Uint8Array> | null;
};

// Wire shape: bytes from the driver. The player-visible `RawMemory.foreignSegment.data` lives
// behind a lazy getter installed by `loadForeignSegment` so the UTF-16 decode only runs if the
// script actually reads the string.
export type ForeignSegmentPayload = {
	username: string;
	id: number;
	bytes: Readonly<Uint8Array>;
};

interface ForeignSegment {
	/**
	 * Another player's name
	 * @public
	 */
	username: string;

	/**
	 * The ID of the requested memory segment.
	 * @public
	 */
	id: number;

	/**
	 * The segment contents.
	 * @public
	 */
	data: string;
}

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
 * Returns the request from `RawMemory.setActiveForeignSegment`. Tri-state:
 * `undefined` = no call this tick, `null` = explicit clear, object = new request.
 */
export function flushForeignSegment() {
	const tmp = requestedForeignSegment;
	requestedForeignSegment = undefined;
	return tmp;
}

/**
 * Returns the update from `RawMemory.setDefaultPublicSegment`. Tri-state:
 * `undefined` = no call this tick, `null` = explicit clear, number = new default.
 */
export function flushDefaultPublicSegment() {
	const tmp = requestedDefaultPublicSegment;
	requestedDefaultPublicSegment = undefined;
	return tmp;
}

/**
 * Returns the update from `RawMemory.setPublicSegments`
 */
export function flushPublicSegments() {
	const tmp = requestedPublicSegments;
	requestedPublicSegments = undefined;
	return tmp;
}

export function loadForeignSegment(payload: ForeignSegmentPayload | null | undefined) {
	// Tri-state: `undefined` = no change from driver, `null` = explicit clear, object = install
	if (payload === undefined) {
		return;
	}
	if (payload === null) {
		RawMemory.foreignSegment = undefined;
		return;
	}
	const { username, id, bytes } = payload;
	let decoded: string | undefined;
	RawMemory.foreignSegment = {
		username,
		id,
		get data() {
			return decoded ?? function() {
				const uint16 = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length >>> 1);
				return typedArrayToString(uint16);
			}();
		},
	};
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
	return Fn.pipe(
		entries,
		$$ => Fn.map($$, ([ id, string ]): SegmentPayload | undefined => {
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
						payload: utf16ToBuffer(string, SharedArrayBuffer),
					};
				}
			}
		}),
		$$ => Fn.filter($$),
		$$ => [ ...$$ ]);
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
