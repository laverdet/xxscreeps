import type { PlayerInstance } from 'xxscreeps/engine/runner/instance';
import type { InitializationPayload, TickPayload, TickResult } from '.';

type DriverLifecycleMethod<Payload> = (player: PlayerInstance, payload: Payload) => Promise<void> | void;
export const driverInitializers: DriverLifecycleMethod<InitializationPayload>[] = [];
export const driverRefreshers: DriverLifecycleMethod<TickPayload>[] = [];
export const driverSavers: DriverLifecycleMethod<TickResult>[] = [];
export function registerDriverHooks({ initialize, refresh, save }: {
	initialize?: typeof driverInitializers[any];
	refresh?: typeof driverRefreshers[any];
	save?: typeof driverSavers[any];
}) {
	initialize && driverInitializers.push(initialize);
	refresh && driverRefreshers.push(refresh);
	save && driverSavers.push(save);
}

type RuntimeInitializer = (payload: InitializationPayload) => void;
export const initializers: RuntimeInitializer[] = [];
export function registerRuntimeInitializer(fn: RuntimeInitializer) {
	initializers.push(fn);
}

export let tickReceive = (_payload: TickPayload) => {};
export let tickSend = (_result: TickResult) => {};
export function registerRuntimeTick({ receive, send }: { receive?: typeof tickReceive; send?: typeof tickSend }) {
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
