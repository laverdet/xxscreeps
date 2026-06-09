import type { Transform } from '../webpack.js';
import type { InspectorSession } from 'isolated-vm';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/engine/runner/index.js';
import config from 'xxscreeps/config/index.js';
import { configTransform } from 'xxscreeps/config/webpack.js';
import { hooks } from 'xxscreeps/driver/index.js';
import { path } from 'xxscreeps/driver/pathfinder/pathfinder.js';
import Privates from 'xxscreeps/driver/private/transform.js';
import { schemaTransform } from 'xxscreeps/engine/schema/build/index.js';
import { compile } from '../webpack.js';

const didMakeSandbox = hooks.makeIterated('sandboxCreated');

interface TickSuccessCompletion {
	result: 'success';
	payload: TickResult;
}

interface TickHaltCompletion {
	result: 'disposed';
}

interface TickTimedOutCompletion {
	result: 'timedOut';
	stack?: string;
}

interface TickErrorCompletion {
	result: 'error';
	console?: string | undefined;
}

export type TickCompletion =
	TickSuccessCompletion | TickHaltCompletion | TickTimedOutCompletion | TickErrorCompletion;

export interface Sandbox {
	createInspectorSession: () => InspectorSession;

	dispose: () => void;

	initialize: (data: InitializationPayload) => Promise<void>;
	run: (data: TickPayload) => Promise<TickCompletion>;
}

export function compileRuntimeSource(path: string, transform: Transform) {
	return compile(import.meta.resolve(path), [
		transform,
		configTransform,
		schemaTransform,
		{
			alias: {
				'xxscreeps/engine/processor': 'xxscreeps/driver/runtime/tripwire',
			},
			babel: Privates,
			externals: ({ request }) => {
				if (request === 'xxscreeps/driver/pathfinder/pf.js') {
					return 'globalThis["@xxscreeps/pathfinder"]';
				}
			},
		},
	]);
}

export async function createSandbox(userId: string, payload: InitializationPayload): Promise<Sandbox> {
	const sandbox = await async function() {
		switch (config.runner.sandbox ?? 'isolated') {
			case 'experimental': {
				throw new Error('Not implemented');
			}
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

export const pathFinderBinaryPath = path;
