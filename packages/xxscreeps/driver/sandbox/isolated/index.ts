import type { Sandbox, TickCompletion } from 'xxscreeps/driver/sandbox/index.js';
import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner/index.js';
import type { UnknownObject } from 'xxscreeps/utility/types.js';
import ivm from 'isolated-vm';
import * as ivmInspect from 'ivm-inspect';
import Webpack from 'webpack';
import VirtualModulesPlugin from 'webpack-virtual-modules';
import { config } from 'xxscreeps/config/index.js';
import { makeModSourceText } from 'xxscreeps/config/loader.js';
import { mods } from 'xxscreeps/config/mods.js';
import { hooks } from 'xxscreeps/driver/index.js';
import Privates from 'xxscreeps/driver/private/plugin.js';
import { pathFinderBinaryPath } from 'xxscreeps/driver/sandbox/index.js';
import { compile } from 'xxscreeps/driver/webpack.js';
import { makePackagesModule } from 'xxscreeps/engine/schema/build/index.js';
import { runOnce } from 'xxscreeps/utility/memoize.js';

type Runtime = typeof import('xxscreeps/driver/sandbox/isolated/runtime.js');

const useInspector = [ ...hooks.map('isolateInspector') ].some(use => use);

const getPathFinderModule = runOnce(() => new ivm.NativeModule(pathFinderBinaryPath));

const getRuntimeSource = runOnce(() => {
	const runtime = import.meta.resolve('xxscreeps/driver/sandbox/isolated/runtime.js');
	return compile(runtime, {
		babel: [ Privates ],
		alias: {
			process: 'xxscreeps/driver/sandbox/isolated/process.js',
			'/xxscreeps:private-symbol': 'xxscreeps/driver/private/symbol/isolated-vm.js',
			'xxscreeps/engine/schema/build/index.js': 'xxscreeps/engine/schema/build/runtime.js',
			'xxscreeps/game/constants/index.js': import.meta.resolve('xxscreeps/game/constants/index.js'),
		},
		externals: ({ request }) => {
			switch (request) {
				case '#pf': return "globalThis['@xxscreeps/pathfinder']";
				case 'isolated-vm': return 'ivm';
				case 'node:util': return 'nodeUtilImport';
				case 'xxscreeps/config/mods.js': throw new Error('config required from runtime');
				case 'xxscreeps/engine/processor/index.js': throw new Error('processor required from runtime');
				default: return undefined;
			}
		},
		plugins: [
			new Webpack.NormalModuleReplacementPlugin(/^xxscreeps:.+/, resource => {
				resource.request = '/' + resource.request;
			}),
			new VirtualModulesPlugin({
				'/xxscreeps:mods/constants': makeModSourceText(mods, 'constants'),
				'/xxscreeps:mods/game': makeModSourceText(mods, 'game'),
				'/xxscreeps:mods/schema': makeModSourceText(mods, 'schema'),
				'/xxscreeps:packages': makePackagesModule(),
			}),
		],
	});
});

export class IsolatedSandbox implements Sandbox {
	private tick?: ivm.Reference<Runtime['tick']>;
	private totalTime = 0n;
	private readonly isolate;

	constructor(data: InitializationPayload) {
		// Initialize isolate and context
		this.isolate = new ivm.Isolate({
			inspector: useInspector,
			memoryLimit: config.runner.cpu.memoryLimit + (data.terrainBlob.byteLength >> 20),
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const runtime: ivm.Reference<Runtime> = await script.run(context, { release: true, reference: true });
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

	dispose(): undefined {
		try {
			this.isolate.dispose();
		} catch {}
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
		} catch (cause: unknown) {
			const error = cause as UnknownObject;
			if (error.message === 'Script execution timed out.') {
				return { result: 'timedOut', stack: String(error.stack) };
			} else if (
				error.message === 'Isolate is disposed' ||
				error.message === 'Isolate was disposed during execution' ||
				error.message === 'Isolate was disposed during execution due to memory limit' ||
				// The memory-limit reaper can dispose the isolate while a tick payload is being
				// deserialized on its thread, which surfaces as v8's generic clone error rather than
				// one of the disposal messages above.
				(error.message === 'Unable to deserialize cloned data.' && this.isolate.isDisposed)
			) {
				return { result: 'disposed' };
			}
			throw cause;
		}
	}
}
