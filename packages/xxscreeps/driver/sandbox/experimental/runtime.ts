import type { Compiler } from 'xxscreeps/driver/runtime/index.js';
import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner/index.js';
import type { CPU } from 'xxscreeps/game/game.js';
import { initialize as runtimeInitialize, tick } from 'xxscreeps/driver/runtime/index.js';
import { hooks } from 'xxscreeps/game/index.js';

export { tick } from 'xxscreeps/driver/runtime/index.js';

class ExperimentalCPU implements CPU {
	bucket;
	limit;
	tickLimit;
	readonly #startTime;

	constructor(data: TickPayload) {
		this.bucket = data.cpu.bucket;
		this.limit = data.cpu.limit;
		this.tickLimit = data.cpu.tickLimit;
		this.#startTime = Date.now();
	}

	getHeapStatistics = () => { throw new Error('not implemented'); };

	getUsed = () => Number(Date.now() - this.#startTime);

	halt = () => { throw new Error('not implemented'); };
}

hooks.register('gameInitializer', (game, data) => {
	game.cpu = new ExperimentalCPU(data!);
});

export function initialize(data: InitializationPayload) {
	const compiler: Compiler<object> = {
		// `vm` module only support async operation
		compile() { throw new Error('Modules are not supported within `sandbox: unsafe`'); },
		evaluate() { throw new Error(); },
	};
	// eslint-disable-next-line no-eval
	runtimeInitialize(compiler, eval, data);
}

// @ts-expect-error
globalThis.tick = tick;
// @ts-expect-error
globalThis.initialize = initialize;
