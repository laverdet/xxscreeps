import { registerDriverHooks } from 'xxscreeps/driver';
import { loadUserFlagBlob, saveUserFlagBlobForNextTick } from './model';

registerDriverHooks({
	async initialize(player, payload) {
		payload.flagBlob = await loadUserFlagBlob(player.shard, player.userId);
	},
	refresh() {

	},
	async save(player, payload) {
		if (payload.flagNextBlob) {
			await saveUserFlagBlobForNextTick(player.shard, player.userId, payload.flagNextBlob);
		}
	},
});
