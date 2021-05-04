import { registerDriverConnector } from 'xxscreeps/driver';
import { publishVisualsBlobForNextTick } from './model';

registerDriverConnector(player => [ undefined, {
	async save(payload) {
		// Publish visuals
		const { visuals } = payload;
		if (visuals) {
			await publishVisualsBlobForNextTick(player.shard, player.userId, visuals.roomNames, visuals.blob);
		}
	},
} ]);
