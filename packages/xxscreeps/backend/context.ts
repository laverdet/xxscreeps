import type { World } from 'xxscreeps/game/map.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';

export class BackendContext {
	readonly db;
	readonly shard;
	world: World;

	private constructor(db: Database, shard: Shard, world: World) {
		this.db = db;
		this.shard = shard;
		this.world = world;
	}

	static async connect() {
		// Connect to services
		const db = await Database.connect();
		const shard = await Shard.connect(db, 'shard0');
		const world = await shard.loadWorld();
		return new BackendContext(db, shard, world);
	}

	/** Refresh `world` after an out-of-band mutation (terrain or active-rooms
	 * set). Callers receive the new instance through `this.world` on next
	 * access; there's no promise of atomicity across in-flight requests. */
	async reloadWorld() {
		this.world = await this.shard.loadWorld();
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
