import type { AsyncEffectAndResult, MaybePromise } from 'xxscreeps/utility/types';
import type { PlayerInstance } from 'xxscreeps/engine/runner/instance';
import type { InitializationPayload, TickPayload, TickResult } from '.';

type DriverConnectorFactory = (player: PlayerInstance) => AsyncEffectAndResult<DriverConnector>;
export type DriverConnector = {
	initialize?: (payload: InitializationPayload) => MaybePromise<void>;
	refresh?: (payload: TickPayload) => MaybePromise<void>;
	save?: (payload: TickResult) => MaybePromise<void>;
};
export const driverConnectors: DriverConnectorFactory[] = [];

/**
 * Registers hook which generates or retrieves information for `registerRuntimeConnector` functions
 */
export function registerDriverConnector(connector: DriverConnectorFactory) {
	driverConnectors.push(connector);
}

type RuntimeInitializer = (payload: InitializationPayload) => void;
export const initializers: RuntimeInitializer[] = [];
export let tickReceive = (_payload: TickPayload) => {};
export let tickSend = (_result: TickResult) => {};

/**
 * Registers methods which will run in the player's sandbox runtime.
 * - `initialize` will run once when the sandbox is created and receives `InitializationPayload`
 *   from `DriverConnector#initialize`
 * - `receive` runs before each tick and receives `TickPayload` from `DriverConnector#refresh`
 * - `send` runs after each tick and generates `TickResult` which will be sent to
 *   `DriverConnector#save`
 */
export function registerRuntimeConnector({ initialize, receive, send }: {
	initialize?: typeof initializers[any];
	receive?: typeof tickReceive;
	send?: typeof tickSend;
}) {
	initialize && initializers.push(initialize);
	if (receive) {
		const prev = tickReceive;
		tickReceive = payload => {
			prev(payload);
			receive(payload);
		};
	}
	if (send) {
		const prev = tickSend;
		tickSend = payload => {
			send(payload);
			prev(payload);
		};
	}
}
