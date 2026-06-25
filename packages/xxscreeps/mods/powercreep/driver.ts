import type { PowerCreepRecord } from './record.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { loadRoster } from './model.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		powerCreeps: PowerCreepRecord[];
	}
}

hooks.register('runnerConnector', player => {
	const { shard, userId } = player;
	return [ undefined, {
		async refresh(payload) {
			payload.powerCreeps = await loadRoster(shard.db, userId);
		},
	} ];
});
