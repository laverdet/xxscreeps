import { defineGlobal, registerGlobal } from 'xxscreeps/game';
import { registerRuntimeConnector } from 'xxscreeps/driver';
import { extend } from 'xxscreeps/utility/utility';
import { Room } from 'xxscreeps/game/room';
import { RawMemory, flush, get, initialize } from './memory';

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

// Receive and send memory payload from driver
declare module 'xxscreeps/driver' {
	interface InitializationPayload {
		memoryBlob: Readonly<Uint8Array> | null;
	}
	interface TickResult {
		memoryNextBlob: Readonly<Uint8Array> | null;
	}
}
registerRuntimeConnector({
	initialize(payload) {
		initialize(payload.memoryBlob);
	},

	send(payload) {
		payload.memoryNextBlob = flush();
	},
});

// Define `Room#memory`
declare module 'xxscreeps/game/room/room' {
	interface Room {
		memory: any;
	}
}
extend(Room, {
	get memory() {
		const memory = get();
		const rooms = memory.rooms ??= {};
		return rooms[this.name] ??= {};
	},
});
