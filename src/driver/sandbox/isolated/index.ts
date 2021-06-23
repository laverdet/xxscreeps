import type { InitializationPayload, TickPayload } from 'xxscreeps/driver';
import type { Print } from 'xxscreeps/driver/runtime';
import type { Sandbox } from 'xxscreeps/driver/sandbox';
import ivm from 'isolated-vm';
import * as ivmInspect from 'ivm-inspect';
import { runOnce } from 'xxscreeps/utility/memoize';
import { compileRuntimeSource, pathFinderBinaryPath } from 'xxscreeps/driver/sandbox';
import { hooks } from 'xxscreeps/driver';
type Runtime = typeof import('xxscreeps/driver/sandbox/isolated/runtime');

const useInspector = [ ...hooks.map('isolateInspector') ].some(use => use);

const getPathFinderModule = runOnce(() => {
	const module = new ivm.NativeModule(pathFinderBinaryPath);
	return { path: pathFinderBinaryPath, module };
});

const getRuntimeSource = runOnce(() => compileRuntimeSource('xxscreeps/driver/sandbox/isolated/runtime', {
	alias: {
		'xxscreeps/driver/private/symbol': 'xxscreeps/driver/private/symbol/isolated-vm',
	},
	externals: ({ request }) =>
		request === 'util' ? 'nodeUtilImport' :
		request === 'isolated-vm' ? 'ivm' : undefined,
}));

export class IsolatedSandbox implements Sandbox {
	private totalTime = 0n;

	private constructor(
		private readonly isolate: ivm.Isolate,
		private readonly tick: ivm.Reference<Runtime['tick']>,
	) {}

	static async create(data: InitializationPayload, print: Print) {
		// Generate new isolate and context
		const isolate = new ivm.Isolate({
			inspector: useInspector,
			memoryLimit: 128,
		});
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
				const instance = await pf.module.create(context);
				await context.global.set(pf.path, instance.derefInto());
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
		]);

		// Initialize runtime.ts and load player code + memory
		const runtime: ivm.Reference<Runtime> = await script.run(context, { reference: true });
		const [ initialize, tick ] = await Promise.all([
			runtime.get('initialize', { accessors: true, reference: true }),
			runtime.get('tick', { accessors: true, reference: true }),
			context.global.delete(pf.path),
			context.global.delete('ivm'),
			context.global.delete('nodeUtilImport'),
		]);
		await initialize.apply(undefined, [ isolate, context, new ivm.Reference(print), data ], { arguments: { copy: true } });
		return new IsolatedSandbox(isolate, tick);
	}

	createInspectorSession() {
		return this.isolate.createInspectorSession();
	}

	dispose() {
		this.isolate.dispose();
	}

	async run(args: TickPayload) {
		try {
			const payload = await this.tick.apply(
				undefined,
				[ args ], {
					arguments: { copy: true },
					result: { copy: true },
					timeout: Math.floor(args.cpu.tickLimit),
				});
			const totalTime = this.isolate.cpuTime;
			payload.usage.cpu = Number(totalTime - this.totalTime) / 1e6;
			this.totalTime = totalTime;
			return { result: 'success' as const, payload };
		} catch (err) {
			if (err.message === 'Script execution timed out.') {
				return { result: 'timedOut' as const };
			}
			throw err;
		}
	}
}
