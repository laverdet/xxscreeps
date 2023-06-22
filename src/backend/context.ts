import type { World } from 'xxscreeps/game/map.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';

export class BackendContext {
	private constructor(
		public readonly db: Database,
		public readonly shard: Shard,
		public readonly world: World,
		public readonly accessibleRooms: Set<string>,
	) {}

	static async connect() {
		// Connect to services
		const db = await Database.connect();
		const shard = await Shard.connect(db, 'shard0');
		const world = await shard.loadWorld();
		const rooms = await shard.data.smembers('rooms');
		const context = new BackendContext(db, shard, world, new Set(rooms));
		return context;
	}

	disconnect() {
		this.db.disconnect();
		this.shard.disconnect();
	}
}
