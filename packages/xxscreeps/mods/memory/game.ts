import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { RawMemory, flush, flushActiveSegments, flushDefaultPublicSegment, flushForeignSegment, flushPublicSegments, flushSegments, get, initialize, loadForeignSegment, loadSegments } from './memory.js';

// Export `Memory` and `RawMemory` to runtime globals
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		Memory: any;
		RawMemory: typeof RawMemory;
	}
}
registerGlobal('RawMemory', RawMemory);

// Define `Room#memory`
declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		memory: any;
	}
}

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickUsageResult {
		memory?: number;
	}
}

extend(Room, {
	memory: {
		get(): unknown {
			return (get().rooms ??= {})[this.name] ??= {};
		},
		set(memory: unknown) {
			(get().rooms ??= {})[this.name] ??= memory;
		},
	},
});

hooks.register('runtimeConnector', {
	initialize(payload) {
		initialize(payload.memoryBlob);
	},

	receive(payload) {
		loadSegments(payload.memorySegments);
		loadForeignSegment(payload.foreignSegment);
		// Redefine memory each tick, expected behavior from vanilla server
		Object.defineProperty(globalThis, 'Memory', {
			configurable: true,
			enumerable: true,
			get,
		});
	},

	send(payload) {
		// Primary memory
		payload.memoryUpdated = flush();
		payload.usage.memory = payload.memoryUpdated.size;
		// Segments
		payload.activeSegmentsRequest = flushActiveSegments();
		payload.foreignSegmentRequest = flushForeignSegment();
		payload.memorySegmentsUpdated = flushSegments();
		payload.defaultPublicSegmentUpdate = flushDefaultPublicSegment();
		payload.publicSegmentsUpdate = flushPublicSegments();
	},
});
