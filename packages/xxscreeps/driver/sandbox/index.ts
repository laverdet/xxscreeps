import type { Transform } from '../webpack.js';
import type { InspectorSession } from 'isolated-vm';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/engine/runner/index.js';
import * as Path from 'node:path';
import config from 'xxscreeps/config/index.js';
import { configTransform } from 'xxscreeps/config/webpack.js';
import { hooks } from 'xxscreeps/driver/index.js';
import Privates from 'xxscreeps/driver/private/transform.js';
import { schemaTransform } from 'xxscreeps/engine/schema/build/index.js';
import { locateModule } from '../pathfinder.js';
import { compile } from '../webpack.js';

const didMakeSandbox = hooks.makeIterated('sandboxCreated');

export interface Sandbox {
	createInspectorSession: () => InspectorSession;

	dispose: () => void;

	initialize: (data: InitializationPayload) => Promise<void>;
	run: (data: TickPayload) => Promise<{
		result: 'error';
		console: string | undefined;
	} | {
		result: 'disposed';
	} | {
		result: 'timedOut';
		stack?: string;
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
				request?.endsWith('.node')
					? `globalThis[${JSON.stringify(Path.join(context!, request))}]` : undefined,
		},
	]);
}

export async function createSandbox(userId: string, payload: InitializationPayload): Promise<Sandbox> {
	const sandbox = await async function() {
		switch (config.runner.sandbox ?? 'isolated') {
			case 'isolated': {
				const { IsolatedSandbox } = await import('./isolated/index.js');
				return new IsolatedSandbox(payload);
			}
			case 'unsafe': {
				const { NodejsSandbox } = await import('./nodejs/index.js');
				return new NodejsSandbox();
			}
			default: throw new Error(`Invalid sandbox mode: ${config.runner.sandbox}`);
		}
	}();
	await sandbox.initialize(payload);
	didMakeSandbox(sandbox, userId);
	return sandbox;
}

export const pathFinderBinaryPath = locateModule();
