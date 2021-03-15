import * as Path from 'path';
import config from 'xxscreeps/config';
import { locateModule } from '../path-finder';
import { compile, ExternalsFunctionElement } from '../webpack';
import { IsolatedSandbox } from './isolated';
import { NodejsSandbox } from './nodejs';

export type Sandbox = IsolatedSandbox | NodejsSandbox;
export type Options = {
	codeBlob: Readonly<Uint8Array>;
	flagBlob?: Readonly<Uint8Array>;
	memoryBlob?: Readonly<Uint8Array>;
	terrainBlob: Readonly<Uint8Array>;
	userId: string;
	writeConsole: (fd: number, payload: string) => void;
};

export function compileRuntimeSource(externals?: ExternalsFunctionElement) {
	return compile('xxscreeps/driver/runtime.js', ({ context, request }, callback) => {
		if (request?.endsWith('.node')) {
			return callback(undefined, `globalThis[${JSON.stringify(Path.join(context!, request))}]`);
		}
		if (externals as any as boolean) {
			(externals as any)({ context, request }, callback);
		} else {
			callback();
		}
	});
}

export async function createSandbox(options: Options) {
	if (config.runner?.unsafeSandbox === true) {
		return NodejsSandbox.create(options);
	} else {
		return IsolatedSandbox.create(options);
	}
}

export const pathFinderBinaryPath = locateModule();
