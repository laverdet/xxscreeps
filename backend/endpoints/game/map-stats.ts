import { Endpoint } from '~/backend/endpoint';
import { readGame } from '~/engine/metabase/game';
import { BlobStorage } from '~/storage/blob';

export const MapStatsEndpoint: Endpoint = {
	method: 'post',
	path: '/map-stats',

	async execute() {
		const blobStorage = await BlobStorage.connect();
		const gameMetadata = readGame(await blobStorage.load('game'));
		blobStorage.disconnect();
		const stats: Dictionary<{ status: string }> = {};
		for (const room of gameMetadata.activeRooms) {
			stats[room] = { status: 'normal' };
		}
		return {
			ok: 1,
			gameTime: this.context.time,
			stats,
			users: {},
		};
	},
};
