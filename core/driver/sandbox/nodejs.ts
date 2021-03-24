import { createRequire } from 'module';
import vm from 'vm';
import { runOnce } from 'xxscreeps/utility/memoize';
import type { TickArguments } from '../runtime';
import { compileRuntimeSource, pathFinderBinaryPath, Options } from '.';
type Runtime = typeof import('../runtime');

const getPathFinderModule = runOnce(() => {
	const require = createRequire(import.meta.url);
	const module = require(pathFinderBinaryPath);
	return { identifier: pathFinderBinaryPath, module };
});

const getCompiledRuntime = runOnce(async() => {
	const { source, map } = await compileRuntimeSource(({ request }, callback) => {
		if (request === 'util') {
			return callback(undefined, 'nodeUtilImport');
		}
		callback();
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

	static async create({ userId, codeBlob, flagBlob, memoryBlob, terrainBlob, writeConsole }: Options) {

		// Generate new vm context, set up globals
		const context = vm.createContext();
		context.global = context;
		context.nodeUtilImport = (await import('util')).default;
		const pf = getPathFinderModule();
		context[pf.identifier] = pf.module;

		// Initialize runtime.ts and load player code + memory
		const { script, map } = await getCompiledRuntime();
		context.runtimeSourceMap = map;
		const runtime: Runtime = script.runInContext(context);
		delete context.nodeUtilImport;
		delete context[pf.identifier];
		const { tick } = runtime;
		runtime.initialize(
			(source: string, filename: string) => (new vm.Script(source, { filename })).runInContext(context),
			writeConsole,
			{ userId, codeBlob, flagBlob, memoryBlob, terrainBlob },
		);
		return new NodejsSandbox(tick);
	}

	dispose() {}

	run(args: TickArguments) {
		return Promise.resolve(this.tick(args));
	}
}
