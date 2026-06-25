import type { World } from 'xxscreeps/game/map.js';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';

export class BackendContext {
	readonly disposable;
	readonly db;
	readonly shard;
	readonly world;
	readonly accessibleRooms;

	private constructor(disposable: AsyncDisposableStack, db: Database, shard: Shard, world: World, accessibleRooms: Set<string>) {
		this.disposable = disposable;
		this.db = db;
		this.shard = shard;
		this.world = world;
		this.accessibleRooms = accessibleRooms;
	}

	static async connect() {
		// Connect to services
		await using disposable = new AsyncDisposableStack();
		const db = disposable.use(await Database.connect());
		const shard = disposable.use(await Shard.connect(db, config.shards[0]!.name));
		const world = await shard.loadWorld();
		const rooms = await shard.data.sMembers('rooms');
		const context = new BackendContext(disposable.move(), db, shard, world, new Set(rooms));
		return context;
	}

	[Symbol.asyncDispose]() {
		return this.disposable.disposeAsync();
	}
}
