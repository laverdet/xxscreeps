import { Endpoint } from '~/backend/endpoint';
import * as DatabaseSchema from '~/engine/metabase';
import { getReader } from '~/lib/schema';
import { BlobStorage } from '~/storage/blob';

export const MapStatsEndpoint: Endpoint = {
	method: 'post',
	path: '/map-stats',

	async execute() {
		const blobStorage = await BlobStorage.connect();
		const gameReader = getReader(DatabaseSchema.schema.Game, DatabaseSchema.interceptorSchema);
		const gameMetadata = gameReader(await blobStorage.load('game'));
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
