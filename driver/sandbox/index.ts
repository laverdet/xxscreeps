import configPromise from '~/engine/config';
import { UserCode } from '~/engine/metabase/code';
import { runOnce } from '~/lib/memoize';
import { locateModule } from '../pathfinder';
import { compile } from '../webpack';
import { IsolatedSandbox } from './isolated';
import { NodejsSandbox } from './nodejs';

export type Sandbox = IsolatedSandbox | NodejsSandbox;

export function getPathFinderInfo() {
	const path = locateModule();
	return { path, identifier: path.replace(/[/\\.]/g, '_') };
}

export const getRuntimeSource = runOnce(() => compile('~/driver/runtime.ts'));

export async function createSandbox(userId: string, userCode: UserCode) {
	if ((await configPromise).config?.processor?.unsafeSandbox === true) {
		return NodejsSandbox.create(userId, userCode);
	} else {
		return IsolatedSandbox.create(userId, userCode);
	}
}
