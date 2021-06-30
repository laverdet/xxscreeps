import type ivm from 'isolated-vm';
import type { CPU } from 'xxscreeps/game/game';
import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner';
import * as Runtime from 'xxscreeps/driver/runtime';
import { hooks } from 'xxscreeps/game';
export { tick } from 'xxscreeps/driver/runtime';

export let isolate: ivm.Isolate;

declare module 'xxscreeps/game/game' {
	interface CPU {
		/**
		 * Use this method to get heap statistics for your virtual machine. The return value is almost
		 * identical to the Node.js function `v8.getHeapStatistics()`. This function returns one
		 * additional property: `externally_allocated_size` which is the total amount of currently
		 * allocated memory which is not included in the v8 heap but counts against this isolate's memory
		 * limit. `ArrayBuffer` instances over a certain size are externally allocated and will be counted
		 * here.
		 */
		getHeapStatistics(): ivm.HeapStatistics;

		/**
		 * Reset your runtime environment and wipe all data in heap memory.
		 */
		halt(): never;
	}
}

class IsolatedCPU implements CPU {
	bucket;
	limit;
	tickLimit;
	#startTime;

	constructor(data: TickPayload) {
		this.bucket = data.cpu.bucket;
		this.limit = data.cpu.limit;
		this.tickLimit = data.cpu.tickLimit;
		this.#startTime = isolate.wallTime;
	}

	getHeapStatistics() {
		return isolate.getHeapStatisticsSync();
	}

	getUsed() {
		return Number(isolate.wallTime - this.#startTime) / 1e6;
	}

	halt() {
		isolate.dispose();
		return undefined as never;
	}
}

hooks.register('gameInitializer', (game, data) => {
	game.cpu = new IsolatedCPU(data!);
});

export function initialize(
	isolate_: ivm.Isolate,
	context: ivm.Context,
	printRef: ivm.Reference<Runtime.Print>,
	data: InitializationPayload,
) {
	isolate = isolate_;
	// Evaluation for plain JS scripts
	const evaluate: Runtime.Evaluate = (source, filename) => {
		const script = isolate_.compileScriptSync(source, { filename });
		return script.runSync(context, { reference: true }).deref();
	};

	// Compilation for ES Modules
	type WithFilename = ivm.Module & Record<'filename', string>;
	const compiler: Runtime.Compiler<WithFilename> = {
		compile(source, filename) {
			const module = isolate_.compileModuleSync(source, { filename }) as WithFilename;
			module.filename = filename;
			return module;
		},
		evaluate(module, linker) {
			module.instantiateSync(context, (specifier, referrer) =>
				linker(specifier, (referrer as WithFilename).filename));
			module.evaluateSync();
			return module.namespace.deref();
		},
	};

	const print: Runtime.Print = (fd, payload) => printRef.applySync(undefined, [ fd, payload ]);
	Runtime.initialize(compiler, evaluate, print, data);
}
