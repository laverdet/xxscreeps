import { hooks as processorHooks } from 'xxscreeps/engine/processor/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { GlobalControlWatcher, insertControlledRoom } from './model.js';

processorHooks.register('refreshRoom', async (shard, room) => {
	const userId = room['#user'];
	if (userId != null) {
		if (room['#level'] > 0) {
			await insertControlledRoom(shard, userId, room.name);
		}
	}
});

hooks.register('runnerConnector', async player => {
	const { shard, userId } = player;
	const watcher = await GlobalControlWatcher.create(shard, userId);
	return [ () => watcher.disposeAsync(), {
		refresh(payload) {
			payload.gcl = watcher.gcl;
			payload.controlledRoomCount = watcher.controlledRoomCount;
		},
	} ];
});

// ---

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		controlledRoomCount: number;
		gcl: number;
	}
}
