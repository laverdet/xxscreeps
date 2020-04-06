import ivm from 'isolated-vm';
import * as ivmInspect from 'ivm-inspect';
import { runOnce } from '~/lib/memoize';
import type * as Runtime from '~/driver/runtime';
import { compileRuntimeSource, getPathFinderInfo, Options } from '.';

const getPathFinderModule = runOnce(() => {
	const { identifier, path } = getPathFinderInfo();
	const module = new ivm.NativeModule(path);
	return { identifier, module };
});

const getRuntimeSource = runOnce(async() =>
	compileRuntimeSource(({ request }, callback) => {
		if (request === 'util') {
			return callback(null, 'nodeUtilImport');
		}
		callback();
	}));

export class IsolatedSandbox {
	private constructor(
		private readonly tick: ivm.Reference<typeof Runtime.tick>,
	) {}

	static async create({ userId, codeBlob, terrain, writeConsole }: Options) {
		// Generate new isolate and context
		const isolate = new ivm.Isolate({ memoryLimit: 128 });
		const [ context, script ] = await Promise.all([
			isolate.createContext(),
			isolate.compileScript(await getRuntimeSource(), { filename: 'runtime.js' }),
		]);

		// Set up required globals before running ./runtime.ts
		const { identifier: pfIdentifier, module } = getPathFinderModule();
		await Promise.all([
			async function() {
				const instance = await module.create(context);
				await context.global.set(pfIdentifier, instance.derefInto());
			}(),
			async function() {
				const util = await ivmInspect.create(isolate, context);
				const deref = {
					formatWithOptions: util.formatWithOptions.derefInto({ release: true }),
					inspect: util.inspect.derefInto({ release: true }),
				};
				await context.global.set('nodeUtilImport', deref, { copy: true });
			}(),
		]);

		// Initialize runtime.ts and load player code + memory
		const runtime: ivm.Reference<typeof Runtime> = await script.run(context, { reference: true });
		const [ tick, initialize ] = await Promise.all([
			runtime.get('tick', { reference: true }),
			runtime.get('initializeIsolated', { reference: true }),
			context.global.delete(pfIdentifier),
			context.global.delete('nodeUtilImport'),
		]);
		const writeConsoleRef = new ivm.Reference(writeConsole);
		await initialize.apply(undefined, [ isolate, context, userId, codeBlob, terrain, writeConsoleRef ], { arguments: { copy: true } });
		return new IsolatedSandbox(tick);
	}

	async run(time: number, roomBlobs: Readonly<Uint8Array>[]) {
		const result = await this.tick.apply(undefined, [ time, roomBlobs ], { arguments: { copy: true }, result: { copy: true } });
		return {
			intents: result[0],
		};
	}
}
