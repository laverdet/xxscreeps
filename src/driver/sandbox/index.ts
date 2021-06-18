import type { Transform } from '../webpack';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/driver';
import type { InspectorSession } from 'isolated-vm';
import type { Print } from 'xxscreeps/driver/runtime';
import * as Path from 'path';
import config from 'xxscreeps/config';
import Privates from 'xxscreeps/driver/private/transform';
import { configTransform } from 'xxscreeps/config/webpack';
import { schemaTransform } from 'xxscreeps/engine/schema/build';
import { hooks } from 'xxscreeps/driver';
import { locateModule } from '../path-finder';
import { compile } from '../webpack';
import { runOnce } from 'xxscreeps/utility/memoize';

const didMakeSandbox = runOnce(() => hooks.makeIterated('sandboxCreated'));

export interface Sandbox {
	createInspectorSession(): InspectorSession;

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

export async function createSandbox(data: InitializationPayload, userId: string, print: Print): Promise<Sandbox> {
	const sandbox = await async function() {
		if (config.runner.unsafeSandbox) {
			const { NodejsSandbox } = await import('./nodejs');
			return NodejsSandbox.create(data, print);
		} else {
			const { IsolatedSandbox } = await import('./isolated');
			return IsolatedSandbox.create(data, print);
		}
	}();
	didMakeSandbox()(sandbox, userId);
	return sandbox;
}

export const pathFinderBinaryPath = locateModule();
