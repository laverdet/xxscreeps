import type { World } from 'xxscreeps/game/map.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';

export class BackendContext {
	readonly db;
	readonly shard;
	readonly world;
	readonly accessibleRooms;

	private constructor(db: Database, shard: Shard, world: World, accessibleRooms: Set<string>) {
		this.db = db;
		this.shard = shard;
		this.world = world;
		this.accessibleRooms = accessibleRooms;
	}

	static async connect() {
		// Connect to services
		const db = await Database.connect();
		const shard = await Shard.connect(db, 'shard0');
		const world = await shard.loadWorld();
		const rooms = await shard.data.smembers('rooms');
		const context = new BackendContext(db, shard, world, new Set(rooms));
		return context;
	}

	/** Save pending changes then disconnect. Use on graceful shutdown. */
	async close() {
		await Promise.all([ this.db.save(), this.shard.save() ]);
		this.disconnect();
	}

	/** Disconnect without saving. Callers that need persistence should use close(). */
	disconnect() {
		this.db.disconnect();
		this.shard.disconnect();
	}
}
