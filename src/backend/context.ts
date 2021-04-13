import * as GameSchema from 'xxscreeps/engine/metadata/game';
import { Shard } from 'xxscreeps/engine/model/shard';
import type { GameMessage } from 'xxscreeps/engine/service';
import { readWorld, World } from 'xxscreeps/game/map';
import * as Storage from 'xxscreeps/storage';
import { Channel, Subscription } from 'xxscreeps/storage/channel';
import { Mutex } from 'xxscreeps/storage/mutex';
import { Authentication } from './auth/model';
import * as User from 'xxscreeps/engine/metadata/user';

export class BackendContext {
	private constructor(
		public readonly shard: Shard,
		public readonly storage: Storage.Provider,
		public readonly gameChannel: Subscription<GameMessage>,
		public readonly world: World,
		public readonly accessibleRooms: Set<string>,
		public readonly gameMutex: Mutex,
		public readonly auth: Authentication,
		public time: number,
	) {
		// Keep current time up to date
		gameChannel.listen(message => {
			if (message.type === 'tick') {
				this.time = message.time;
			}
		});
	}

	static async connect() {
		// Connect to services
		const shard = await Shard.connect('shard0');
		const storage = await Storage.connect('shard0');
		const { blob } = storage;
		const gameChannel = await new Channel<GameMessage>(storage, 'main').subscribe();
		const world = readWorld(await blob.get('terrain'));
		const game = GameSchema.read(await blob.get('game'));
		const gameMutex = await Mutex.connect(storage, 'game');
		const auth = await Authentication.connect(storage);
		const context = new BackendContext(shard, storage, gameChannel, world, new Set(game.rooms.keys()), gameMutex, auth, game.time);
		return context;
	}

	async disconnect() {
		this.storage.disconnect();
		this.gameChannel.disconnect();
		await this.gameMutex.disconnect();
	}

	async loadUser(id: string) {
		return User.read(await this.storage.blob.get(`user/${id}/info`));
	}
}
