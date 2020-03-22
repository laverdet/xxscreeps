import ivm from 'isolated-vm';
import type { UserCode } from '~/engine/metabase/code';
import { compile } from './webpack';

let runtimeSourceData: Promise<string>;
function getRuntimeSource() {
	if (runtimeSourceData === undefined) {
		runtimeSourceData = compile('~/driver/runtime.ts');
	}
	return runtimeSourceData;
}

export class Sandbox {
	constructor(
		private readonly tick: ivm.Reference<Function>,
	) {}

	static async create(userId: string, userCode: UserCode) {
		const isolate = new ivm.Isolate({ memoryLimit: 128 });
		const [ context, script ] = await Promise.all([
			isolate.createContext(),
			isolate.compileScript(await getRuntimeSource(), { filename: 'runtime.js' }),
		]);

		await context.global.set('global', context.global.derefInto());
		await context.evalClosure(
			'global.print = (...args) => $0.applySync(undefined, ' +
				'args.map(arg => typeof arg === "string" ? arg : JSON.stringify(arg)))',
			[ (...messages: string[]) => console.log(...messages) ],
			{ arguments: { reference: true } },
		);

		const runtime = await script.run(context, { reference: true });
		const [ tick ] = await Promise.all([
			runtime.get('tick'),
			async function() {
				const initialize = await runtime.get('initialize') as ivm.Reference<any>;
				await initialize.apply(undefined, [ isolate, context, userId, userCode ], { arguments: { copy: true } });
			}(),
		]);

		return new Sandbox(tick as ivm.Reference<any>);
	}

	async run(roomBlobs: Readonly<Uint8Array>[]) {
		await this.tick.apply(undefined, [ roomBlobs ], { arguments: { copy: true } });
	}
}
