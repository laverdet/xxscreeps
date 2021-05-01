import { defineGlobal, registerGlobal } from 'xxscreeps/game';
import { registerRuntimeInitializer, registerRuntimeTick } from 'xxscreeps/driver';
import { RawMemory, flush, get, initialize } from './memory';

// Export to runtime globals
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
registerRuntimeInitializer(payload => initialize(payload.memoryBlob));
registerRuntimeTick({
	send(payload) {
		payload.memoryNextBlob = flush();
	},
});
