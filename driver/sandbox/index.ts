import configPromise from '~/engine/config';
import { runOnce } from '~/lib/memoize';
import { locateModule } from '../path-finder';
import { compile } from '../webpack';
import { IsolatedSandbox } from './isolated';
import { NodejsSandbox } from './nodejs';

export type Sandbox = IsolatedSandbox | NodejsSandbox;

export function getPathFinderInfo() {
	const path = locateModule();
	return { path, identifier: path.replace(/[/\\.-]/g, '_') };
}

export const getRuntimeSource = runOnce(() => compile('~/driver/runtime.ts'));

export async function createSandbox(userId: string, codeBlob: Readonly<Uint8Array>, terrain: Readonly<Uint8Array>) {
	if ((await configPromise).config?.runner?.unsafeSandbox === true) {
		return NodejsSandbox.create(userId, codeBlob, terrain);
	} else {
		return IsolatedSandbox.create(userId, codeBlob, terrain);
	}
}
