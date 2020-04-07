import vm from 'vm';
import { runOnce } from '~/lib/memoize';
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

	static async create({ userId, codeBlob, memoryBlob, terrain, writeConsole }: Options) {

		// Generate new vm context, set up globals
		const context = vm.createContext();
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
			{ userId, codeBlob, memoryBlob, terrain },
		);
		return new NodejsSandbox(tick);
	}

	dispose() {}

	run(time: number, roomBlobs: Readonly<Uint8Array>[], consoleEval?: string[]) {
		return Promise.resolve(this.tick(time, roomBlobs, consoleEval));
	}
}
