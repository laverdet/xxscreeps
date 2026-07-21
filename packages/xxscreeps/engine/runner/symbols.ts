import type { InitializationPayload, RunnerWorker, TickPayload, TickResult } from './index.js';
import type { PlayerInstance } from 'xxscreeps/engine/runner/instance.js';
import type { AsyncEffectAndResult, MaybePromise } from 'xxscreeps/utility/types.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export const hooks = makeHookRegistration<{
	/**
	 * Registers hook which generates or retrieves information for `hooks.register('runtimeConnector', ` functions
	 */
	runnerConnector: (player: PlayerInstance, runner: RunnerWorker) => AsyncEffectAndResult<{
		initialize?: (payload: InitializationPayload) => MaybePromise<void>;
		refresh?: (payload: TickPayload) => MaybePromise<void>;
		save?: (payload: TickResult) => MaybePromise<void>;
	}>;

	/**
	 * Hook to shared instantiate per-runner thread resources.
	 */
	runnerWorker: (runner: RunnerWorker) => Promise<AsyncDisposable | Disposable | undefined>;
}>();
