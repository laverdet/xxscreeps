import { hooks } from 'xxscreeps/engine/runner/index.js';
import { GlobalPowerWatcher } from './model.js';

hooks.register('runnerConnector', async player => {
	const { shard, userId } = player;
	const watcher = await GlobalPowerWatcher.create(shard, userId);
	return [ () => watcher.disposeAsync(), {
		refresh(payload) {
			payload.power = watcher.power;
		},
	} ];
});

// ---

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		power: number;
	}
}
