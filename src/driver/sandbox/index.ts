import * as Path from 'path';
import config from 'xxscreeps/config';
import { configTransform } from 'xxscreeps/config/webpack';
import { schemaTransform } from 'xxscreeps/engine/schema/build';
import { locateModule } from '../path-finder';
import { compile, Transform } from '../webpack';
import { IsolatedSandbox } from './isolated';
import { NodejsSandbox } from './nodejs';

export type Sandbox = IsolatedSandbox | NodejsSandbox;
export type Options = {
	codeBlob: Readonly<Uint8Array>;
	flagBlob?: Readonly<Uint8Array>;
	memoryBlob: Readonly<Uint8Array> | null;
	terrainBlob: Readonly<Uint8Array>;
	userId: string;
	writeConsole: (fd: number, payload: string) => void;
};

export function compileRuntimeSource(transform?: Transform) {
	return compile('xxscreeps/driver/runtime.js', [
		...transform ? [ transform ] : [],
		configTransform,
		schemaTransform,
		{
			externals: ({ context, request }) =>
				request?.endsWith('.node') ?
					`globalThis[${JSON.stringify(Path.join(context!, request))}]` : undefined,
		},
	]);
}

export async function createSandbox(options: Options) {
	if (config.runner.unsafeSandbox) {
		return NodejsSandbox.create(options);
	} else {
		return IsolatedSandbox.create(options);
	}
}

export const pathFinderBinaryPath = locateModule();
