import type { CPU } from 'xxscreeps/game/game';
import type { Evaluate, Print } from 'xxscreeps/driver/runtime';
import type { InitializationPayload, TickPayload } from 'xxscreeps/driver';
import * as Runtime from 'xxscreeps/driver/runtime';
import { hooks } from 'xxscreeps/game';
export { tick } from 'xxscreeps/driver/runtime';

let process: typeof import('process');

class NodejsCPU implements CPU {
	bucket;
	limit;
	tickLimit;
	#startTime;

	constructor(data: TickPayload) {
		this.bucket = data.cpu.bucket;
		this.limit = data.cpu.limit;
		this.tickLimit = data.cpu.tickLimit;
		this.#startTime = process.hrtime.bigint();
	}

	getHeapStatistics() {
		return {} as never;
	}

	getUsed() {
		return Number(process.hrtime.bigint() - this.#startTime) / 1e6;
	}

	halt(): never {
		throw new Error('Cannot halt()');
	}
}

hooks.register('gameInitializer', (game, data) => {
	game.cpu = new NodejsCPU(data!);
});

export function initialize(require: NodeRequire, evaluate: Evaluate, printFn: Print, data: InitializationPayload) {
	process = require('process');
	Runtime.initialize(evaluate, printFn, data);
}
