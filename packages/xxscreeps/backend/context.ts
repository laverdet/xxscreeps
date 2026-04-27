import type { World } from 'xxscreeps/game/map.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';

export class BackendContext {
	readonly disposable;
	readonly db;
	readonly shard;
	readonly world;
	readonly accessibleRooms;

	private constructor(disposable: DisposableStack, db: Database, shard: Shard, world: World, accessibleRooms: Set<string>) {
		this.disposable = disposable;
		this.db = db;
		this.shard = shard;
		this.world = world;
		this.accessibleRooms = accessibleRooms;
	}

	static async connect() {
		// Connect to services
		using disposable = new DisposableStack();
		const db = disposable.use(await Database.connect());
		const shard = disposable.use(await Shard.connect(db, 'shard0'));
		const world = await shard.loadWorld();
		const rooms = await shard.data.smembers('rooms');
		const context = new BackendContext(disposable.move(), db, shard, world, new Set(rooms));
		return context;
	}

	disconnect() {
		this.disposable.dispose();
	}
}
