import type { FlagIntent } from './model';
import { registerDriverConnector } from 'xxscreeps/driver';
import { getFlagChannel, loadUserFlagBlob, saveUserFlagBlobForNextTick } from './model';

registerDriverConnector(async player => {
	// Listen for flag modification requests from backend, send to player sandbox for processing
	const channel = await getFlagChannel(player.shard, player.userId).subscribe();
	const intents: FlagIntent[] = [];
	channel.listen(message => {
		if (message.type === 'intent') {
			intents.push(message.intent);
		}
	});
	return [ () => channel.disconnect(), {
		async initialize(payload) {
			// Get current flag payload
			payload.flagBlob = await loadUserFlagBlob(player.shard, player.userId);
		},

		refresh(payload) {
			// Send received flag intents
			payload.flagIntents = intents.splice(0);
		},

		async save(payload) {
			// Save updated flags
			if (payload.flagNextBlob) {
				await saveUserFlagBlobForNextTick(player.shard, player.userId, payload.flagNextBlob);
			}
		},
	} ];
});
