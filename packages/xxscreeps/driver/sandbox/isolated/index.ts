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
	private isolate: ivm.Isolate;

	constructor(data: InitializationPayload) {
		// Initialize isolate and context
		this.isolate = new ivm.Isolate({
			inspector: useInspector,
			memoryLimit: config.runner.cpu.memoryLimit + data.terrainBlob.length,
		});
	}

	async initialize(data: InitializationPayload) {
		const { isolate } = this;
		const context = await isolate.createContext({ inspector: useInspector });

		// Set up required globals
		const pf = getPathFinderModule();
		const [ script ] = await Promise.all([
			async function() {
				const { source, map } = await getRuntimeSource();
				context.global.setIgnored('runtimeSourceMap', map);
				return isolate.compileScript(source, { filename: 'runtime.js' });
			}(),
			async function() {
				const instance = await pf.create(context);
				await context.global.set('@xxscreeps/pathfinder', instance.derefInto());
			}(),
			async function() {
				const util = await ivmInspect.create(isolate, context);
				const deref = {
					formatWithOptions: util.formatWithOptions.derefInto({ release: true }),
					inspect: util.inspect.derefInto({ release: true }),
				};
				await context.global.set('nodeUtilImport', deref, { copy: true });
			}(),
			context.global.set('global', context.global.derefInto()),
			context.global.set('ivm', ivm),
			context.global.set('exports', {}, { copy: true }),
		]);

		// Initialize runtime.ts and load player code + memory
		const runtime: ivm.Reference<Runtime> = await script.run(context, { reference: true });
		const [ initialize, tick ] = await Promise.all([
			runtime.get('initialize', { accessors: true, reference: true }),
			runtime.get('tick', { accessors: true, reference: true }),
			context.global.delete('@xxscreeps/pathfinder'),
			context.global.delete('ivm'),
			context.global.delete('nodeUtilImport'),
		]);
		this.tick = tick;
		await initialize.apply(undefined, [ isolate, context, data ], { arguments: { copy: true } });
	}

	createInspectorSession() {
		return this.isolate.createInspectorSession();
	}

	dispose() {
		this.tick?.release();
		this.tick = undefined;
		try {
			this.isolate.dispose();
		} catch {}
		this.isolate = undefined as unknown as ivm.Isolate;
	}

	async run(args: TickPayload): Promise<TickCompletion> {
		try {
			const completion = await this.tick!.apply(
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
			} else if (err.message === 'Isolate is disposed') {
				return { result: 'disposed' };
			}
			throw err;
		}
	}
}
