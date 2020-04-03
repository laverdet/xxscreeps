import ivm from 'isolated-vm';
import { runOnce } from '~/lib/memoize';
import type { UserCode } from '~/engine/metadata/code';
import type * as Runtime from '~/driver/runtime';
import { getPathFinderInfo, getRuntimeSource } from '.';

const getPathFinderModule = runOnce(() => {
	const { identifier, path } = getPathFinderInfo();
	const module = new ivm.NativeModule(path);
	return { identifier, module };
});

export class IsolatedSandbox {
	private constructor(
		private readonly tick: ivm.Reference<typeof Runtime.tick>,
	) {}

	static async create(userId: string, userCode: UserCode, terrain: Readonly<Uint8Array>) {
		// Generate new isolate and context
		const isolate = new ivm.Isolate({ memoryLimit: 128 });
		const [ context, script ] = await Promise.all([
			isolate.createContext(),
			isolate.compileScript(await getRuntimeSource(), { filename: 'runtime.js' }),
		]);

		// Set up required globals before running ./runtime.ts
		const { identifier, module } = getPathFinderModule();
		await Promise.all([
			async function() {
				const instance = await module.create(context);
				await context.global.set(identifier, instance.derefInto());
			}(),
			async function() {
				await context.global.set('global', context.global.derefInto());
				await context.evalClosure(
					'global.print = (...args) => $0.applySync(undefined, ' +
						'args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)))',
					[ (...messages: string[]) => console.log(...messages) ],
					{ arguments: { reference: true } },
				);
			}(),
		]);

		// Initialize runtime.ts and load player code + memory
		const runtime: ivm.Reference<typeof Runtime> = await script.run(context, { reference: true });
		const [ tick, initialize ] = await Promise.all([
			runtime.get('tick', { reference: true }),
			runtime.get('initializeIsolated', { reference: true }),
			context.global.delete(identifier),
		]);
		await initialize.apply(undefined, [ isolate, context, userId, userCode, terrain ], { arguments: { copy: true } });
		return new IsolatedSandbox(tick);
	}

	async run(time: number, roomBlobs: Readonly<Uint8Array>[]) {
		const result = await this.tick.apply(undefined, [ time, roomBlobs ], { arguments: { copy: true }, result: { copy: true } });
		return {
			intents: result[0] as Dictionary<SharedArrayBuffer>,
		};
	}
}
