import type { InitializationPayload, TickPayload } from 'xxscreeps/driver';
import type { Evaluate, Print } from 'xxscreeps/driver/runtime';
import util from 'util';
import vm from 'vm';
import { createRequire } from 'module';
import { runOnce } from 'xxscreeps/utility/memoize';
import { compileRuntimeSource, pathFinderBinaryPath } from 'xxscreeps/driver/sandbox';
type Runtime = typeof import('xxscreeps/driver/runtime');

const getPathFinderModule = runOnce(() => {
	const require = createRequire(import.meta.url);
	const module = require(pathFinderBinaryPath);
	return { path: pathFinderBinaryPath, module };
});

const getCompiledRuntime = runOnce(async() => {
	const { source, map } = await compileRuntimeSource({
		externals: ({ request }) => request === 'util' ? 'nodeUtilImport' : undefined,
	});
	return {
		script: new vm.Script(source, { filename: 'runtime.js' }),
		map,
	};
});

export class NodejsSandbox {
	private constructor(
		private readonly tick: Runtime['tick'],
	) {}

	static async create(data: InitializationPayload, print: Print) {

		// Generate new vm context, set up globals
		const context = vm.createContext();
		context.global = context;
		context.nodeUtilImport = util;
		const pf = getPathFinderModule();
		context[pf.path] = pf.module;

		// Initialize runtime.ts and load player code + memory
		const { script, map } = await getCompiledRuntime();
		context.runtimeSourceMap = map;
		const runtime: Runtime = script.runInContext(context);
		delete context.nodeUtilImport;
		delete context[pf.path];
		const evaluate: Evaluate = (source, filename) => new vm.Script(source, { filename }).runInContext(context);
		runtime.initialize(evaluate, print, data);
		context._tick = runtime.tick;
		const wrappedTick: Runtime['tick'] = function(...args) {
			context._args = args;
			return vm.runInContext('_tick(..._args)', context, { timeout: 1000 });
		};
		return new NodejsSandbox(wrappedTick);
	}

	dispose() {}

	run(args: TickPayload) {
		return Promise.resolve(this.tick(args));
	}
}
