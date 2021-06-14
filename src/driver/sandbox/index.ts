import type { Transform } from '../webpack';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/driver';
import type { Print } from 'xxscreeps/driver/runtime';
import * as Path from 'path';
import config from 'xxscreeps/config';
import Privates from 'xxscreeps/driver/private/transform';
import { configTransform } from 'xxscreeps/config/webpack';
import { schemaTransform } from 'xxscreeps/engine/schema/build';
import { locateModule } from '../path-finder';
import { compile } from '../webpack';

export interface Sandbox {
	dispose(): void;

	run(data: TickPayload): Promise<{
		result: 'disposed' | 'timedOut';
	} | {
		result: 'success';
		payload: TickResult;
	}>;
}

export function compileRuntimeSource(path: string, transform: Transform) {
	return compile(path, [
		transform,
		configTransform,
		schemaTransform,
		{
			alias: {
				'xxscreeps/engine/processor': 'xxscreeps/driver/runtime/tripwire',
			},
			babel: Privates,
			externals: ({ context, request }) =>
				request?.endsWith('.node') ?
					`globalThis[${JSON.stringify(Path.join(context!, request))}]` : undefined,
		},
	]);
}

export async function createSandbox(data: InitializationPayload, print: Print): Promise<Sandbox> {
	if (config.runner.unsafeSandbox) {
		const { NodejsSandbox } = await import('./nodejs');
		return NodejsSandbox.create(data, print);
	} else {
		const { IsolatedSandbox } = await import('./isolated');
		return IsolatedSandbox.create(data, print);
	}
}

export const pathFinderBinaryPath = locateModule();
