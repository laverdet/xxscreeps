import ivm from 'isolated-vm';
import * as ivmInspect from 'ivm-inspect';
import { runOnce } from 'xxscreeps/utility/memoize';
import type * as Runtime from 'xxscreeps/driver/runtime';
import type { TickArguments } from '../runtime';
import { compileRuntimeSource, pathFinderBinaryPath, Options } from '.';

const getPathFinderModule = runOnce(() => {
	const module = new ivm.NativeModule(pathFinderBinaryPath);
	return { identifier: pathFinderBinaryPath, module };
});

const getRuntimeSource = runOnce(async() =>
	compileRuntimeSource({
		externals: ({ request }) => request === 'util' ? 'nodeUtilImport' : undefined,
	 }));

export class IsolatedSandbox {
	private constructor(
		private readonly isolate: ivm.Isolate,
		private readonly tick: ivm.Reference<typeof Runtime.tick>,
	) {}

	static async create({ userId, codeBlob, flagBlob, memoryBlob, terrainBlob, writeConsole }: Options) {
		// Generate new isolate and context
		const isolate = new ivm.Isolate({ memoryLimit: 128 });
		const context = await isolate.createContext();

		// Set up required globals before running ./runtime.ts
		const pf = getPathFinderModule();
		const [ script ] = await Promise.all([
			async function() {
				const { source, map } = await getRuntimeSource();
				context.global.setIgnored('runtimeSourceMap', map);
				return isolate.compileScript(source, { filename: 'runtime.js' });
			}(),
			async function() {
				const instance = await pf.module.create(context);
				await context.global.set(pf.identifier, instance.derefInto());
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
		const runtime: ivm.Reference<typeof Runtime> = await script.run(context, { reference: true });
		const [ tick, initialize ] = await Promise.all([
			runtime.get('tick', { reference: true }),
			runtime.get('initializeIsolated', { reference: true }),
			context.global.delete(pf.identifier),
			context.global.delete('nodeUtilImport'),
		]);
		const writeConsoleRef = new ivm.Reference(writeConsole);
		const data = { userId, codeBlob, flagBlob, memoryBlob, terrainBlob };
		await initialize.apply(undefined, [ isolate, context, writeConsoleRef, data ], { arguments: { copy: true } });
		return new IsolatedSandbox(isolate, tick);
	}

	dispose() {
		this.isolate.dispose();
	}

	run(args: TickArguments) {
		return this.tick.apply(undefined, [ args ], { arguments: { copy: true }, result: { copy: true } });
	}
}
