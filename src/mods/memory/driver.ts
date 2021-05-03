import { registerDriverConnector } from 'xxscreeps/driver';
import { loadUserMemoryBlob, saveUserMemoryBlobForNextTick } from './model';

registerDriverConnector(player => [ undefined, {
	async initialize(payload) {
		// Get current memory payload
		payload.memoryBlob = await loadUserMemoryBlob(player.shard, player.userId);
	},

	async save(payload) {
		// Save updated memory
		if (payload.memoryNextBlob) {
			await saveUserMemoryBlobForNextTick(player.shard, player.userId, payload.memoryNextBlob);
		}
	},
} ]);
