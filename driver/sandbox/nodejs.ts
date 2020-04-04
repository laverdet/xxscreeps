import vm from 'vm';
import { runOnce } from '~/lib/memoize';
import { getPathFinderInfo, getRuntimeSource } from '.';

const getPathFinderModule = runOnce(() => {
	const { identifier, path } = getPathFinderInfo();
	const module = require(path);
	return { identifier, module };
});

const getCompiledRuntime = runOnce(async() =>
	new vm.Script(await getRuntimeSource(), { filename: 'runtime.js' }));

export class NodejsSandbox {
	private constructor(
		private readonly tick: (...args: any[]) => any,
	) {}

	static async create(userId: string, codeBlob: Readonly<Uint8Array>, terrain: Readonly<Uint8Array>) {

		// Generate new vm context, set up globals
		const context = vm.createContext();
		context.console = console;
		const { identifier, module } = getPathFinderModule();
		context[identifier] = module;

		// Initialize runtime.ts and load player code + memory
		const runtime = (await getCompiledRuntime()).runInContext(context);
		const { tick } = runtime;
		delete context[identifier];
		runtime.initialize(
			(source: string, filename: string) => (new vm.Script(source, { filename })).runInContext(context),
			userId, codeBlob,
			terrain,
		);
		return new NodejsSandbox(tick);
	}

	run(time: number, roomBlobs: Readonly<Uint8Array>[]) {
		const result = this.tick(time, roomBlobs);
		return Promise.resolve({
			intents: result[0] as Dictionary<SharedArrayBuffer>,
		});
	}
}
