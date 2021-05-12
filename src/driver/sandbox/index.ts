import type { Transform } from '../webpack';
import type { InitializationPayload } from 'xxscreeps/driver';
import type { Print } from 'xxscreeps/driver/runtime';
import * as Path from 'path';
import config from 'xxscreeps/config';
import Privates from 'xxscreeps/driver/private/transform';
import { configTransform } from 'xxscreeps/config/webpack';
import { schemaTransform } from 'xxscreeps/engine/schema/build';
import { locateModule } from '../path-finder';
import { compile } from '../webpack';
import { IsolatedSandbox } from './isolated/isolated';
import { NodejsSandbox } from './nodejs';

export type Sandbox = IsolatedSandbox | NodejsSandbox;

export function compileRuntimeSource(transform: Transform, path = 'xxscreeps/driver/runtime') {
	return compile(path, [
		transform,
		configTransform,
		schemaTransform,
		{
			babel: Privates,
			externals: ({ context, request }) =>
				request?.endsWith('.node') ?
					`globalThis[${JSON.stringify(Path.join(context!, request))}]` : undefined,
		},
	]);
}

export async function createSandbox(data: InitializationPayload, print: Print) {
	if (config.runner.unsafeSandbox) {
		return NodejsSandbox.create(data, print);
	} else {
		return IsolatedSandbox.create(data, print);
	}
}

export const pathFinderBinaryPath = locateModule();
