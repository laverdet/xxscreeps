import type { World } from 'xxscreeps/game/map';
import { Database } from 'xxscreeps/engine/database';
import { Shard } from 'xxscreeps/engine/shard';
import { Mutex } from 'xxscreeps/engine/storage/mutex';

export class BackendContext {
	private constructor(
		public readonly db: Database,
		public readonly shard: Shard,
		public readonly world: World,
		public readonly accessibleRooms: Set<string>,
		public readonly gameMutex: Mutex,
	) {}

	static async connect() {
		// Connect to services
		const db = await Database.connect();
		const shard = await Shard.connect(db, 'shard0');
		const world = await shard.loadWorld();
		const gameMutex = await Mutex.connect('game', shard.data, shard.pubsub);
		const rooms = await shard.data.smembers('rooms');
		const context = new BackendContext(db, shard, world, new Set(rooms), gameMutex);
		return context;
	}

	async disconnect() {
		await this.gameMutex.disconnect();
		this.shard.disconnect();
	}
}
