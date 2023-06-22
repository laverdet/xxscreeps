import type { AsyncEffectAndResult, MaybePromise } from 'xxscreeps/utility/types.js';
import type { PlayerInstance } from 'xxscreeps/engine/runner/instance.js';
import type { InitializationPayload, TickPayload, TickResult } from './index.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export const hooks = makeHookRegistration<{
	/**
	 * Registers hook which generates or retrieves information for `hooks.register('runtimeConnector', ` functions
	 */
	runnerConnector: (player: PlayerInstance) => AsyncEffectAndResult<{
		initialize?: (payload: InitializationPayload) => MaybePromise<void>;
		refresh?: (payload: TickPayload) => MaybePromise<void>;
		save?: (payload: TickResult) => MaybePromise<void>;
	}>;
}>();
