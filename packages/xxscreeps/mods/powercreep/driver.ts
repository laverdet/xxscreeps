import { hooks } from 'xxscreeps/engine/runner/index.js';
import { getPowerCreepChannel, loadPowerCreepsBlob } from './model.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface InitializationPayload {
		powerCreepsBlob: Readonly<Uint8Array> | null;
	}
	interface TickPayload {
		powerCreepsBlob?: Readonly<Uint8Array> | null;
	}
}

hooks.register('runnerConnector', async player => {
	const { userId } = player;
	const { db } = player.shard;
	let dirty = false;
	const channel = await getPowerCreepChannel(db, userId).subscribe();
	channel.listen(() => {
		dirty = true;
	});
	return [ () => channel.disconnect(), {
		async initialize(payload) {
			payload.powerCreepsBlob = await loadPowerCreepsBlob(db, userId);
		},

		async refresh(payload) {
			if (dirty) {
				dirty = false;
				payload.powerCreepsBlob = await loadPowerCreepsBlob(db, userId);
			}
		},
	} ];
});
