import * as Path from 'path';
import configPromise from '~/engine/config';
import { locateModule } from '../path-finder';
import { compile, ExternalsFunctionElement } from '../webpack';
import { IsolatedSandbox } from './isolated';
import { NodejsSandbox } from './nodejs';

export type Sandbox = IsolatedSandbox | NodejsSandbox;
export type Options = {
	codeBlob: Readonly<Uint8Array>;
	terrain: Readonly<Uint8Array>;
	userId: string;
	writeConsole: (fd: number, payload: string) => void;
};

export function compileRuntimeSource(externals?: ExternalsFunctionElement) {
	return compile('~/driver/runtime.ts', ({ context, request }, callback) => {
		if (request.endsWith('.node')) {
			return callback(null, Path.join(context, request).replace(/[/\\.-]/g, '_'));
		}
		if (externals) {
			externals({ context, request }, callback);
		} else {
			callback();
		}
	});
}

export function getPathFinderInfo() {
	const path = locateModule();
	return { path, identifier: path.replace(/[/\\.-]/g, '_') };
}

export async function createSandbox(options: Options) {
	if ((await configPromise).config?.runner?.unsafeSandbox === true) {
		return NodejsSandbox.create(options);
	} else {
		return IsolatedSandbox.create(options);
	}
}
