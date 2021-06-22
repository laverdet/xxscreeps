import type { AsyncEffectAndResult, MaybePromise } from 'xxscreeps/utility/types';
import type { PlayerInstance } from 'xxscreeps/engine/runner/instance';
import type { InitializationPayload, TickPayload, TickResult } from '.';
import type { Sandbox } from 'xxscreeps/driver/sandbox';
import { makeHookRegistration } from 'xxscreeps/utility/hook';

export const hooks = makeHookRegistration<{
	/**
	 * Registers hook which generates or retrieves information for `hooks.register('runtimeConnector', ` functions
	 */
	driverConnector: (player: PlayerInstance) => AsyncEffectAndResult<{
		initialize?: (payload: InitializationPayload) => MaybePromise<void>;
		refresh?: (payload: TickPayload) => MaybePromise<void>;
		save?: (payload: TickResult) => MaybePromise<void>;
	}>;

	isolateInspector: boolean;
	sandboxCreated: (sandbox: Sandbox, userId: string) => void;
}>();
