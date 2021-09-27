import type { Transform } from '../webpack';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/engine/runner';
import type { InspectorSession } from 'isolated-vm';
import * as Path from 'path';
import config from 'xxscreeps/config';
import Privates from 'xxscreeps/driver/private/transform';
import { configTransform } from 'xxscreeps/config/webpack';
import { schemaTransform } from 'xxscreeps/engine/schema/build';
import { hooks } from 'xxscreeps/driver';
import { locateModule } from '../path-finder';
import { compile } from '../webpack';

const didMakeSandbox = hooks.makeIterated('sandboxCreated');

export interface Sandbox {
	createInspectorSession(): InspectorSession;

	dispose(): void;

	initialize(data: InitializationPayload): Promise<void>;
	run(data: TickPayload): Promise<{
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
				request?.endsWith('.node') ?
					`globalThis[${JSON.stringify(Path.join(context!, request))}]` : undefined,
		},
	]);
}

export async function createSandbox(userId: string, payload: InitializationPayload): Promise<Sandbox> {
	const sandbox = await async function() {
		if (config.runner.unsafeSandbox) {
			const { NodejsSandbox } = await import('./nodejs');
			return new NodejsSandbox;
		} else {
			const { IsolatedSandbox } = await import('./isolated');
			return new IsolatedSandbox(payload);
		}
	}();
	await sandbox.initialize(payload);
	didMakeSandbox(sandbox, userId);
	return sandbox;
}

export const pathFinderBinaryPath = locateModule();
