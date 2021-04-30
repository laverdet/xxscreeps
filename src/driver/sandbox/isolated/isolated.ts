import type { InitializationPayload, TickPayload } from 'xxscreeps/driver';
import type { Print } from 'xxscreeps/driver/runtime';
import ivm from 'isolated-vm';
import * as ivmInspect from 'ivm-inspect';
import { runOnce } from 'xxscreeps/utility/memoize';
import { compileRuntimeSource, pathFinderBinaryPath } from 'xxscreeps/driver/sandbox';
type Runtime = typeof import('xxscreeps/driver/sandbox/isolated/runtime');

const getPathFinderModule = runOnce(() => {
	const module = new ivm.NativeModule(pathFinderBinaryPath);
	return { path: pathFinderBinaryPath, module };
});

const getRuntimeSource = runOnce(() => {
	const path = 'xxscreeps/driver/sandbox/isolated/runtime.js';
	return compileRuntimeSource({
		externals: ({ request }) => request === 'util' ? 'nodeUtilImport' : undefined,
	}, path);
});

export class IsolatedSandbox {
	private constructor(
		private readonly isolate: ivm.Isolate,
		private readonly tick: ivm.Reference<Runtime['tick']>,
	) {}

	static async create(data: InitializationPayload, print: Print) {
		// Generate new isolate and context
		const isolate = new ivm.Isolate({ memoryLimit: 128 });
		const context = await isolate.createContext();

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
		]);

		// Initialize runtime.ts and load player code + memory
		const runtime: ivm.Reference<Runtime> = await script.run(context, { reference: true });
		const [ initialize, tick ] = await Promise.all([
			runtime.get('initialize', { reference: true }),
			runtime.get('tick', { reference: true }),
			context.global.delete(pf.path),
			context.global.delete('nodeUtilImport'),
		]);
		await initialize.apply(undefined, [ isolate, context, new ivm.Reference(print), data ], { arguments: { copy: true } });
		return new IsolatedSandbox(isolate, tick);
	}

	dispose() {
		this.isolate.dispose();
	}

	run(args: TickPayload) {
		return this.tick.apply(undefined, [ args ], { arguments: { copy: true }, result: { copy: true } });
	}
}
