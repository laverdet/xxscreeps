import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { RawMemory, flush, flushActiveSegments, flushDefaultPublicSegment, flushForeignSegment, flushPublicSegments, flushSegments, get, initialize, loadForeignSegment, loadSegments } from './memory.js';

// Export `Memory` and `RawMemory` to runtime globals
declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		/**
		 * A global plain object which can contain arbitrary data. You can access it both using the API
		 * and the Memory UI in the game editor. Learn how to work with memory from
		 * [this article](https://docs.screeps.com/global-objects.html#Memory-object).
		 * @public
		 * @see https://docs.screeps.com/api/#Memory
		 */
		Memory: any;

		/**
		 * `RawMemory` object allows to implement your own memory stringifier instead of built-in
		 * serializer based on `JSON.stringify`. It also allows to request up to 10 MB of additional
		 * memory using asynchronous memory segments feature. You can also access memory segments of
		 * other players using methods below.
		 * @public
		 * @see https://docs.screeps.com/api/#RawMemory
		 */
		RawMemory: typeof RawMemory;
	}
}
registerGlobal('RawMemory', RawMemory);

// Define `Room#memory`
declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		/**
		 * A shorthand to `Memory.rooms[room.name]`. You can use it for quick access the room's specific
		 * memory data object.
		 * [Learn more about memory](https://docs.screeps.com/global-objects.html#Memory-object)
		 * @public
		 * @see https://docs.screeps.com/api/#Room.memory
		 */
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
		set(memory: Record<string, unknown>) {
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
		// Redefine memory each tick, expected behavior from vanilla server.
		// https://github.com/screeps/engine/blob/1b9b1541923f061311474a2f1bac0fea37911f70/src/game/game.js#L479-L500
		// We don't bother setting `RawMemory` each tick because it would be stupid for a player to
		// reset it.
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
