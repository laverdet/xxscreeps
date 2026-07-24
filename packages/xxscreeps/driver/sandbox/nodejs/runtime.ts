import type { TickCompletion } from '../index.js';
import type { Compiler, Evaluate } from 'xxscreeps/driver/runtime/index.js';
import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner/index.js';
import type { CPU } from 'xxscreeps/game/game.js';
import * as assert from 'node:assert/strict';
import * as process from 'node:process';
import { initialize as runtimeInitialize, tick as runtimeTick } from 'xxscreeps/driver/runtime/index.js';
import { hooks } from 'xxscreeps/game/index.js';

const kPleaseHalt = 'Please halt this sandbox.';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickResult {
		unsafeSandboxDidHalt?: boolean;
	}
}

class NodejsCPU implements CPU {
	bucket;
	limit;
	tickLimit;
	readonly #startTime;

	constructor(data: TickPayload) {
		this.bucket = data.cpu.bucket;
		this.limit = data.cpu.limit;
		this.tickLimit = data.cpu.tickLimit;
		this.#startTime = process.hrtime.bigint();
	}

	getHeapStatistics = () => ({} as never);

	getUsed = () => Number(process.hrtime.bigint() - this.#startTime) / 1e6;

	halt = (): never => {
		throw new Error(kPleaseHalt);
	};
}

hooks.register('gameInitializer', (game, data) => {
	game.cpu = new NodejsCPU(data!);
});

// @ts-expect-error
globalThis.__assert = assert;

export function initialize<Module extends object>(require: NodeJS.Require, compiler: Compiler<Module>, evaluate: Evaluate, data: InitializationPayload) {
	runtimeInitialize(compiler, evaluate, data);
}

export function tick(data: TickPayload): TickCompletion {
	let didHalt = false as boolean;
	const completion = runtimeTick(data, fn => {
		try {
			fn();
		} catch (error) {
			if (error instanceof Error && error.message === kPleaseHalt) {
				didHalt = true;
			} else {
				throw error;
			}
		}
	});
	if (completion.result === 'success') {
		completion.payload.unsafeSandboxDidHalt = didHalt;
	}
	return completion;
}
