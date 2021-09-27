import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner';
import type { Compiler, Evaluate } from 'xxscreeps/driver/runtime';
import type { Sandbox } from 'xxscreeps/driver/sandbox';
import util from 'util';
import vm from 'vm';
import { createRequire } from 'module';
import { runOnce } from 'xxscreeps/utility/memoize';
import { compileRuntimeSource, pathFinderBinaryPath } from 'xxscreeps/driver/sandbox';
type Runtime = typeof import('./runtime');

const defaultRequire = createRequire(import.meta.url);

const getPathFinderModule = runOnce(() => {
	const require = createRequire(import.meta.url);
	const module = require(pathFinderBinaryPath);
	return { path: pathFinderBinaryPath, module };
});

const getCompiledRuntime = runOnce(async() => {
	const { source, map } = await compileRuntimeSource('xxscreeps/driver/sandbox/nodejs/runtime', {
		alias: {
			process: 'xxscreeps/driver/sandbox/nodejs/process',
		},
		externals: ({ request }) => request === 'util' ? 'nodeUtilImport' : undefined,
	});
	return {
		script: new vm.Script(source, { filename: 'runtime.js' }),
		map,
	};
});

export class NodejsSandbox implements Sandbox {
	private tick?: Runtime['tick'];

	constructor(
		private readonly context = vm.createContext()) {}

	createInspectorSession(): never {
		throw new Error('Inspector not supported with `backend.unsafeSandbox`');
	}

	dispose() {}

	async initialize(data: InitializationPayload) {

		// Initialize vm context, set up globals
		const { context } = this;
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
		const compiler: Compiler = {
			// `vm` module only support async operation
			compile() { throw new Error('Modules are not supported within `unsafeSandbox`') },
			evaluate() { throw new Error },
		};
		const evaluate: Evaluate = (source, filename) => new vm.Script(source, { filename }).runInContext(context);
		runtime.initialize(defaultRequire, compiler, evaluate, data);
		this.tick = vm.runInContext(`
			(function(context, tick, runInContext) {
				let data;
				_runWithArgs = function() {
					const result = tick(data);
					data = undefined;
					return result;
				};

				return function(data_) {
					data = data_;
					return runInContext('_runWithArgs()', context, { timeout: data.cpu.tickLimit });
				};
			})
		`, context)(context, runtime.tick, vm.runInContext);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async run(data: TickPayload) {
		const start = process.hrtime.bigint();
		try {
			const payload = this.tick!(data);
			if (payload.error) {
				return { result: 'error' as const, console: payload.console };
			}
			payload.usage.cpu = Number(process.hrtime.bigint() - start) / 1e6;
			return { result: 'success' as const, payload };
		} catch (err: any) {
			if (err.message.startsWith('Script execution timed out after')) {
				return { result: 'timedOut' as const };
			}
			throw err;
		}
	}
}
