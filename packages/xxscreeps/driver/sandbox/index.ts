import type { InspectorSession } from 'isolated-vm';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/engine/runner/index.js';
import { config } from 'xxscreeps/config/index.js';
import { hooks } from 'xxscreeps/driver/index.js';
import { path } from 'xxscreeps/driver/pathfinder/pathfinder.js';

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
	dispose: () => Promise<void> | undefined;
	run: (data: TickPayload) => Promise<TickCompletion>;
}

export async function createSandbox(userId: string, payload: InitializationPayload): Promise<Sandbox> {
	const sandbox = await async function() {
		switch (config.runner.sandbox ?? 'isolated') {
			case 'experimental': {
				const { ExperimentalSandbox } = await import('./experimental/index.js');
				return ExperimentalSandbox.create(payload);
			}
			case 'isolated': {
				const { IsolatedSandbox } = await import('./isolated/index.js');
				const sandbox = new IsolatedSandbox(payload);
				await sandbox.initialize(payload);
				return sandbox;
			}
			case 'unsafe': {
				const { NodejsSandbox } = await import('./nodejs/index.js');
				const sandbox = new NodejsSandbox();
				await sandbox.initialize(payload);
				return sandbox;
			}
			default: throw new Error(`Invalid sandbox mode: ${config.runner.sandbox}`);
		}
	}();
	didMakeSandbox(sandbox, userId);
	return sandbox;
}

export const pathFinderBinaryPath = path;
