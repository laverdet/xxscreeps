import type { SegmentPayload } from './memory';
import { defineGlobal, registerGlobal } from 'xxscreeps/game';
import { registerRuntimeConnector } from 'xxscreeps/driver';
import { extend } from 'xxscreeps/utility/utility';
import { Room } from 'xxscreeps/game/room';
import { RawMemory, flush, flushActiveSegments, flushSegments, get, initialize, loadSegments } from './memory';

// Export `Memory` and `RawMemory` to runtime globals
declare module 'xxscreeps/game/runtime' {
	interface Global {
		Memory: any;
		RawMemory: typeof RawMemory;
	}
}
defineGlobal('Memory', {
	configurable: true,
	enumerable: true,
	get,
});
registerGlobal('RawMemory', RawMemory);

// Define `Room#memory`
declare module 'xxscreeps/game/room' {
	interface Room {
		memory: any;
	}
}

extend(Room, {
	memory: {
		get() {
			return (get().rooms ??= {})[this.name] ??= {};
		},
		set(memory: any) {
			(get().rooms ??= {})[this.name] ??= memory;
		},
	},
});

// Receive and send memory payloads from driver
declare module 'xxscreeps/driver' {
	interface InitializationPayload {
		memoryBlob: Readonly<Uint8Array> | null;
	}
	interface TickPayload {
		memorySegments?: SegmentPayload[];
	}
	interface TickResult {
		activeSegmentsRequest: number[] | null;
		memorySegmentsUpdated: SegmentPayload[] | null;
		memoryUpdated: Uint8Array;
	}
}
registerRuntimeConnector({
	initialize(payload) {
		initialize(payload.memoryBlob);
	},

	receive(payload) {
		loadSegments(payload.memorySegments);
	},

	send(payload) {
		// Primary memory
		payload.memoryUpdated = flush();
		payload.usage.memory = payload.memoryUpdated.byteLength >>> 1;
		// Segments
		payload.activeSegmentsRequest = flushActiveSegments();
		payload.memorySegmentsUpdated = flushSegments();
	},
});
