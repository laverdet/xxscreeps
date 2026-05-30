import type { Sandbox, TickCompletion } from 'xxscreeps/driver/sandbox/index.js';
import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner/index.js';
import ivm from 'isolated-vm';
import * as ivmInspect from 'ivm-inspect';
import config from 'xxscreeps/config/index.js';
import { hooks } from 'xxscreeps/driver/index.js';
import { compileRuntimeSource, pathFinderBinaryPath } from 'xxscreeps/driver/sandbox/index.js';
import { runOnce } from 'xxscreeps/utility/memoize.js';

type Runtime = typeof import('xxscreeps/driver/sandbox/isolated/runtime.js');

const useInspector = [ ...hooks.map('isolateInspector') ].some(use => use);

const getPathFinderModule = runOnce(() => new ivm.NativeModule(pathFinderBinaryPath));

const getRuntimeSource = runOnce(() => compileRuntimeSource('xxscreeps/driver/sandbox/isolated/runtime', {
	alias: {
		process: 'xxscreeps/driver/sandbox/isolated/process',
		'xxscreeps/driver/private/symbol.js': 'xxscreeps/driver/private/symbol/isolated-vm.js',
	},
	externals: ({ request }) =>
		request === 'node:util' ? 'nodeUtilImport' :
		request === 'isolated-vm' ? 'ivm' : undefined,
}));

export class IsolatedSandbox implements Sandbox {
	private tick?: ivm.Reference<Runtime['tick']> | undefined;
	private totalTime = 0n;
	private isolate?: ivm.Isolate | undefined;

	constructor(data: InitializationPayload) {
		// Initialize isolate and context
		// terrainBlob.length is in bytes; memoryLimit is in MB — convert before adding
		this.isolate = new ivm.Isolate({
			inspector: useInspector,
			memoryLimit: config.runner.cpu.memoryLimit + Math.ceil(data.terrainBlob.byteLength / (1024 * 1024)),
		});
	}

	async initialize(data: InitializationPayload) {
		const { isolate } = this;
		if (!isolate) {
			throw new Error('Isolate is disposed');
		}
		const context = await isolate.createContext({ inspector: useInspector });

		// Set up required globals sequentially so that an OOM in any step does not
		// leave concurrent in-flight IVM operations on the same (now-disposed) isolate,
		// which would crash with an IsolateEnvironment::GetCurrent() assertion.
		const pf = getPathFinderModule();

		// ivm-inspect runs its own Promise.all internally; run it first and alone so
		// nothing else is racing on the isolate if it triggers an OOM disposal.
		const util = await ivmInspect.create(isolate, context);
		await context.global.set('nodeUtilImport', {
			formatWithOptions: util.formatWithOptions.derefInto({ release: true }),
			inspect: util.inspect.derefInto({ release: true }),
		}, { copy: true });

		const instance = await pf.create(context);
		await context.global.set('@xxscreeps/pathfinder', instance.derefInto({ release: true }));

		const { source, map } = await getRuntimeSource();
		context.global.setIgnored('runtimeSourceMap', map);
		const script = await isolate.compileScript(source, { filename: 'runtime.js' });

		await Promise.all([
			context.global.set('global', context.global.derefInto()),
			context.global.set('ivm', ivm),
			context.global.set('exports', {}, { copy: true }),
		]);

		// Initialize runtime.ts and load player code + memory
		let runtime: ivm.Reference<Runtime> | undefined;
		let initialize: ivm.Reference<Runtime['initialize']> | undefined;
		let tick: ivm.Reference<Runtime['tick']> | undefined;
		try {
			runtime = await script.run(context, { release: true, reference: true });
			initialize = await runtime.get('initialize', { accessors: true, reference: true });
			tick = await runtime.get('tick', { accessors: true, reference: true });
			await Promise.all([
				context.global.delete('@xxscreeps/pathfinder'),
				context.global.delete('ivm'),
				context.global.delete('nodeUtilImport'),
			]);
			this.tick = tick;
			tick = undefined;
			await initialize.apply(undefined, [ isolate, context, data ], { arguments: { copy: true } });
		} finally {
			tick?.release();
			initialize?.release();
			runtime?.release();
		}
	}

	createInspectorSession() {
		if (!this.isolate) {
			throw new Error('Isolate is disposed');
		}
		return this.isolate.createInspectorSession();
	}

	dispose() {
		this.tick?.release();
		this.tick = undefined;
		try {
			this.isolate?.dispose();
		} catch {}
		this.isolate = undefined;
	}

	async run(args: TickPayload): Promise<TickCompletion> {
		if (!this.tick || !this.isolate) {
			return { result: 'disposed' };
		}
		try {
			const completion = await this.tick.apply(
				undefined,
				[ args ], {
					arguments: { copy: true },
					result: { copy: true },
					timeout: args.cpu.tickLimit,
			});
			if (completion.result === 'success') {
				const totalTime = this.isolate.cpuTime;
				completion.payload.usage.cpu = Number(totalTime - this.totalTime) / 1e6;
				this.totalTime = totalTime;
				return completion;
			} else {
				return completion;
			}
		} catch (err: any) {
			if (err.message === 'Script execution timed out.') {
				return { result: 'timedOut', stack: err.stack };
			} else if (err.message === 'Isolate is disposed' || err.message?.startsWith('Isolate was disposed')) {
				// 'Isolate was disposed during execution' (external dispose or OOM) must be caught
				// here so it never propagates to callers wrapping sandbox.run (e.g. prometheus),
				// which would leave the error unhandled and keep the broken sandbox alive.
				return { result: 'disposed' };
			}
			throw err;
		}
	}
}
