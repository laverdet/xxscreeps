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

	/**
	 * Registers methods which will run in the player's sandbox runtime.
	 * - `initialize` will run once when the sandbox is created and receives `InitializationPayload`
	 *   from `DriverConnector#initialize`
	 * - `receive` runs before each tick and receives `TickPayload` from `DriverConnector#refresh`
	 * - `send` runs after each tick and generates `TickResult` which will be sent to
	 *   `DriverConnector#save`
	 */
	runtimeConnector: {
		initialize?: (payload: InitializationPayload) => void;
		receive?: (payload: TickPayload) => void;
		send?: (result: TickResult) => void;
	};

	isolateInspector: boolean;
	sandboxCreated: (sandbox: Sandbox, userId: string) => void;
}>();
