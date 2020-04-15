import vm from 'vm';
import { runOnce } from '~/lib/memoize';
import type { TickArguments } from '../runtime';
import { compileRuntimeSource, getPathFinderInfo, Options } from '.';
type Runtime = typeof import('../runtime');

const getPathFinderModule = runOnce(() => {
	const { identifier, path } = getPathFinderInfo();
	const module = require(path);
	return { identifier, module };
});

const getCompiledRuntime = runOnce(async() =>
	new vm.Script(await compileRuntimeSource(({ request }, callback) => {
		if (request === 'util') {
			return callback(null, 'nodeUtilImport');
		}
		callback();
	}), { filename: 'runtime.js' }));

export class NodejsSandbox {
	private constructor(
		private readonly tick: Runtime['tick'],
	) {}

	static async create({ userId, codeBlob, flagBlob, memoryBlob, terrainBlob, writeConsole }: Options) {

		// Generate new vm context, set up globals
		const context = vm.createContext();
		context.global = context;
		context.nodeUtilImport = require('util');
		const { identifier, module } = getPathFinderModule();
		context[identifier] = module;

		// Initialize runtime.ts and load player code + memory
		const runtime: Runtime = (await getCompiledRuntime()).runInContext(context);
		delete context.nodeUtilImport;
		delete context[identifier];
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
